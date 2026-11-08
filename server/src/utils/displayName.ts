//* 使用者顯示名稱的 SQL：自訂名稱（user_profiles.custom_name）優先，空白時退回 username
//* `user` / `profile` 是 users / user_profiles 在查詢裡的別名
export function displayNameSql(user = "u", profile = "up"): string {
  return `COALESCE(NULLIF(TRIM(${profile}.custom_name), ''), ${user}.username)`;
}
