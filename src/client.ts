import type { MusicListQuery, MusicOrder, MusicStoreClientOptions, MusicTrack } from "./types";
import type { MusicConnector, MusicLyrics, MusicManagedPlayback, MusicSearchResult, MusicStreamInfo } from "./connector";
import { MusicConnectorRegistry } from "./connector-registry";

export class MusicStoreClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  readonly connectors = new MusicConnectorRegistry();

  constructor(options: MusicStoreClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
  }

  async registerConnector(connector: MusicConnector): Promise<void> {
    await this.connectors.register(connector);
  }

  async search(query: MusicListQuery = {}): Promise<MusicSearchResult> {
    const connector = this.connectors.active;
    if (connector) {
      return connector.search(query);
    }
    return { tracks: await this.list(query), total: 0, page: 1, pageSize: 20 };
  }

  async getStreamUrl(trackId: string): Promise<MusicStreamInfo | null> {
    const connector = this.connectors.active;
    if (connector?.getStreamUrl) {
      return connector.getStreamUrl(trackId);
    }
    return null;
  }

  async getManagedPlayback(trackId: string): Promise<MusicManagedPlayback | null> {
    const connector = this.connectors.active;
    if (connector?.getManagedPlayback) {
      return connector.getManagedPlayback(trackId);
    }
    return null;
  }

  async getLyrics(trackId: string): Promise<MusicLyrics | null> {
    const connector = this.connectors.active;
    if (connector?.getLyrics) {
      return connector.getLyrics(trackId);
    }
    return null;
  }

  async list(_query: MusicListQuery = {}): Promise<MusicTrack[]> {
    const connector = this.connectors.active;
    if (connector) {
      const result = await connector.search(_query);
      return result.tracks;
    }
    return [];
  }

  async get(trackId: string): Promise<MusicTrack | null> {
    if (!trackId) {
      throw new Error("trackId is required");
    }
    const connector = this.connectors.active;
    if (connector) {
      return connector.getTrack(trackId);
    }
    return null;
  }

  async createOrder(trackId: string): Promise<MusicOrder> {
    if (!trackId) {
      throw new Error("trackId is required");
    }
    return {
      orderId: "",
      trackId,
      amount: 0,
      currency: "USD",
      status: "pending"
    };
  }

  async verifyOrder(orderId: string): Promise<MusicOrder | null> {
    if (!orderId) {
      throw new Error("orderId is required");
    }
    return null;
  }

  get config() {
    return {
      baseUrl: this.baseUrl,
      hasToken: Boolean(this.token),
      connectors: this.connectors.list().map(c => c.meta),
      activeConnector: this.connectors.active?.meta ?? null,
    };
  }
}
