import { LocationService } from "../locationService";
import { Pool } from "mysql2/promise";

describe("LocationService", () => {
  let locationService: LocationService;
  let mockConnection: {
    execute: jest.Mock;
  };

  beforeEach(() => {
    locationService = new LocationService();
    mockConnection = {
      execute: jest.fn(),
    };
  });

  describe("findOrCreateLocation", () => {
    it("should insert a new location with all fields when place_id does not exist", async () => {
      // 1. check query returns no rows
      mockConnection.execute.mockResolvedValueOnce([[]]);
      // 2. insert returns insertId
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 42 }]);

      const id = await locationService.findOrCreateLocation(
        mockConnection as unknown as Pool,
        {
          place_id: "ChIJ12345",
          name: "台北 101",
          url: "https://maps.google.com/?cid=123",
          full_address: "110台灣台北市信義區信義路五段7號",
          province: "台北市",
          city: "信義區",
          route: "信義路五段",
          zip_code: "110",
          lat: 25.0339639,
          lng: 121.5644722,
        },
      );

      expect(id).toBe(42);
      expect(mockConnection.execute).toHaveBeenCalledTimes(2);

      // Verify the INSERT statement contains all fields
      const insertCall = mockConnection.execute.mock.calls[1];
      expect(insertCall[0]).toContain("INSERT INTO locations");
      expect(insertCall[1]).toEqual([
        "ChIJ12345",
        "台北 101",
        "110台灣台北市信義區信義路五段7號",
        "台北市",
        "信義區",
        "信義路五段",
        "110",
        25.0339639,
        121.5644722,
        "https://maps.google.com/?cid=123",
      ]);
    });

    it("should update missing fields (COALESCE) when location already exists with null values", async () => {
      // Existing record has null for province, city, route, zip_code
      mockConnection.execute.mockResolvedValueOnce([
        [
          {
            id: 10,
            name: null,
            url: null,
            province: null,
            city: null,
            route: null,
            zip_code: null,
            full_address: "某地址",
          },
        ],
      ]);
      // UPDATE query resolved
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const id = await locationService.findOrCreateLocation(
        mockConnection as unknown as Pool,
        {
          place_id: "ChIJexisting",
          name: "大安森林公園",
          url: "https://maps.google.com/?cid=999",
          full_address: "106台灣台北市大安區新生南路二段1號",
          province: "台北市",
          city: "大安區",
          route: "新生南路二段",
          zip_code: "106",
          lat: 25.03,
          lng: 121.53,
        },
      );

      expect(id).toBe(10);
      expect(mockConnection.execute).toHaveBeenCalledTimes(2);

      const updateCall = mockConnection.execute.mock.calls[1];
      expect(updateCall[0]).toContain("UPDATE locations SET");
      expect(updateCall[1]).toEqual([
        "大安森林公園",
        "https://maps.google.com/?cid=999",
        "台北市",
        "大安區",
        "新生南路二段",
        "106",
        10,
      ]);
    });

    it("should generate stable manual:lat,lng place_id when place_id is not provided", async () => {
      // 1. check query for manual place_id returns empty
      mockConnection.execute.mockResolvedValueOnce([[]]);
      // 2. address + coords check returns empty
      mockConnection.execute.mockResolvedValueOnce([[]]);
      // 3. insert returns insertId
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 77 }]);

      const id = await locationService.findOrCreateLocation(
        mockConnection as unknown as Pool,
        {
          full_address: "新北市板橋區縣民大道二段7號",
          province: "新北市",
          city: "板橋區",
          route: "縣民大道二段",
          lat: 25.0135,
          lng: 121.4648,
        },
      );

      expect(id).toBe(77);
      const insertCall = mockConnection.execute.mock.calls[2];
      expect(insertCall[1][0]).toBe("manual:25.0135000,121.4648000");
    });
  });

  describe("buildLocationSearchCondition", () => {
    it("should construct search condition covering name, route, address, city, province, and zip_code", () => {
      const condition = locationService.buildLocationSearchCondition("106");
      expect(condition.sql).toContain("l.name LIKE ?");
      expect(condition.sql).toContain("l.route LIKE ?");
      expect(condition.sql).toContain("l.full_address LIKE ?");
      expect(condition.sql).toContain("l.city LIKE ?");
      expect(condition.sql).toContain("l.province LIKE ?");
      expect(condition.sql).toContain("l.zip_code LIKE ?");
      expect(condition.params).toEqual([
        "%106%",
        "%106%",
        "%106%",
        "%106%",
        "%106%",
        "%106%",
      ]);
    });
  });
});
