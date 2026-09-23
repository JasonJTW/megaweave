// server/src/benchmark/queue/burstPlan.ts
// Queue burst 的工作清單：每個單位代表「一篇附圖的新貼文 + 一次互動」，
// 分別產生 post-image、post-embedding 與 user-vector 工作。內容由 seed 決定，身分只取自 fixture 使用者與貼文。

import type { UserActionType } from "../../queue/jobs/userVector";
import { buildContent, buildTags, buildTitle, FixturePostType } from "../fixture/generateFixture";
import { createRandom, deriveSeed, Random } from "../fixture/random";
import { CATEGORIES, CATEGORY_WEIGHTS } from "../fixture/vocabulary";

export interface PostDraft {
  title: string;
  content: string;
  type: FixturePostType;
  categoryId: number;
  conditionLevel: number;
  tags: string | null;
  items: { title: string; quantity: number }[];
}

export interface BurstLocation {
  id: number;
  province: string;
  city: string;
}

export interface BurstCandidates {
  userIds: readonly number[];
  /** 已有向量的 active fixture 貼文；user-vector 工作需要貼文向量才會更新 */
  interactionPostIds: readonly number[];
  locations: readonly BurstLocation[];
}

export interface BurstUnit {
  index: number;
  post: PostDraft & { userId: number; location: BurstLocation | null };
  images: number;
  interaction: { userId: number; postId: number; action: UserActionType };
}

/** 新貼文的圖片數；production 上限為 5 張，burst 貼文至少 1 張才會產生圖片工作 */
export const BURST_IMAGE_COUNT_WEIGHTS = [[1, 35], [2, 25], [3, 20], [4, 10], [5, 10]] as const;
/** 互動行為比例：瀏覽最多，weave 最少 */
export const INTERACTION_MIX = [["view", 55], ["like", 30], ["comment", 10], ["weave", 5]] as const;
const LOCATION_PROBABILITY = 0.85;

export function generatePostDraft(random: Random): PostDraft {
  const categoryId = random.weighted(CATEGORY_WEIGHTS);
  const category = CATEGORIES.find((c) => c.id === categoryId)!;
  const noun = random.pick(category.nouns);
  const type = random.weighted([["share", 60], ["wish", 30], ["commons", 10]] as const);
  const conditionLevel = random.weighted([[1, 10], [2, 30], [3, 35], [4, 18], [5, 7]] as const);
  const titles = new Set([noun]);
  const extraItems = random.weighted([[0, 60], [1, 25], [2, 15]] as const);
  for (let i = 0; i < extraItems; i++) titles.add(random.pick(category.nouns));

  return {
    title: buildTitle(random, type, noun, conditionLevel),
    content: buildContent(random, noun),
    type,
    categoryId,
    conditionLevel,
    tags: buildTags(random, category.tags),
    items: [...titles].map((title) => ({ title, quantity: random.weighted([[1, 60], [2, 20], [3, 10], [5, 10]] as const) })),
  };
}

export function generateBurstPlan(options: { seed: number; units: number; candidates: BurstCandidates }): BurstUnit[] {
  const { userIds, interactionPostIds, locations } = options.candidates;
  const distinctInteractions = userIds.length * interactionPostIds.length * INTERACTION_MIX.length;
  if (options.units > distinctInteractions / 2) {
    throw new Error(
      `Queue burst needs ${options.units} distinct interactions but the fixture offers only ${distinctInteractions}`,
    );
  }

  const postRandom = createRandom(deriveSeed(options.seed, "queue-burst", "posts"));
  const interactionRandom = createRandom(deriveSeed(options.seed, "queue-burst", "interactions"));
  const usedInteractions = new Set<string>();

  return Array.from({ length: options.units }, (_, index) => {
    const post = {
      ...generatePostDraft(postRandom),
      userId: postRandom.pick(userIds),
      location: postRandom.chance(LOCATION_PROBABILITY) ? postRandom.pick(locations) : null,
    };
    const images = postRandom.weighted(BURST_IMAGE_COUNT_WEIGHTS);

    let interaction: BurstUnit["interaction"];
    do {
      interaction = {
        userId: interactionRandom.pick(userIds),
        postId: interactionRandom.pick(interactionPostIds),
        action: interactionRandom.weighted(INTERACTION_MIX),
      };
    } while (usedInteractions.has(`${interaction.userId}:${interaction.postId}:${interaction.action}`));
    usedInteractions.add(`${interaction.userId}:${interaction.postId}:${interaction.action}`);

    return { index, post, images, interaction };
  });
}
