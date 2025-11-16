import "dotenv/config";

export interface YieldOpportunity {
  vault: string;
  asset: string;
  apy: number;
  apr: number;
  tvl?: string;
  riskLevel?: string;
  timestamp: number;
}

export interface HistoricalAPYParams {
  chainID: string;
  vault?: string; // pool_address in API
  asset?: string; // input_token in API
  lpTokenAddress?: string; // lp_token_address in API (optional)
  timeRange?: string; // Not used in current API format, but kept for compatibility
}

export interface HistoricalAPYResponse {
  success: boolean;
  data?: {
    vault?: string;
    asset?: string;
    historicalAPY: Array<{
      timestamp: number;
      apy: number;
      apr: number;
    }>;
    averageAPY?: number;
    currentAPY?: number;
  };
  error?: string;
}

/**
 * Service to interact with GlueX Yields API
 * Documentation: https://docs.gluex.xyz/api-reference/yield-api/post-historical-apy
 */
export class GlueXYieldsService {
  private apiKey: string;
  private baseUrl: string = "https://yield-api.gluex.xyz";

  constructor() {
    if (!process.env.GLUEX_API_KEY) {
      throw new Error("GLUEX_API_KEY environment variable is not set");
    }
    this.apiKey = process.env.GLUEX_API_KEY;
  }

  /**
   * Get historical APY data for vaults/assets
   * @param params Query parameters
   * @returns Historical APY data
   */
  async getHistoricalAPY(
    params: HistoricalAPYParams
  ): Promise<HistoricalAPYResponse> {
    const url = `${this.baseUrl}/historical-apy`;

    try {
      console.log(`[GlueXYieldsService] Fetching historical APY for:`, params);

      // Map our internal params to GlueX API format
      const chainMap: Record<string, string> = {
        hyperevm: "hyperliquid-evm",
        hyperliquid: "hyperliquid-evm",
        ethereum: "ethereum",
        arbitrum: "arbitrum",
      };

      const body: any = {
        chain: chainMap[params.chainID || "hyperevm"] || params.chainID || "hyperliquid-evm",
      };

      // If vault address is provided, use it as pool_address
      if (params.vault) {
        body.pool_address = params.vault;
        // For ERC-4626 vaults, lp_token_address is typically the vault address itself
        // But can be overridden if provided separately
        body.lp_token_address = params.lpTokenAddress || params.vault;
      }

      // If asset is provided, use it as input_token
      if (params.asset) {
        body.input_token = params.asset;
      }

      console.log(`[GlueXYieldsService] Request body:`, JSON.stringify(body, null, 2));

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[GlueXYieldsService] HTTP error! Status: ${response.status}, Response: ${errorText}`
        );
        throw new Error(
          `HTTP error! Status: ${response.status}, Message: ${errorText}`
        );
      }

      const data = await response.json() as any;
      console.log(`[GlueXYieldsService] Historical APY data received:`, JSON.stringify(data, null, 2));

      // Handle different possible response formats
      // The API might return data directly or wrapped in a data field
      const responseData = data.data || data;

      // Map the API response to our internal format
      // API might return apy, apr, or historical_apy array
      let historicalAPY: Array<{ timestamp: number; apy: number; apr: number }> = [];
      
      if (responseData.historical_apy && Array.isArray(responseData.historical_apy)) {
        historicalAPY = responseData.historical_apy.map((point: any) => ({
          timestamp: point.timestamp || Date.now(),
          apy: point.apy || 0,
          apr: point.apr || point.apy || 0,
        }));
      } else if (responseData.historicalAPY && Array.isArray(responseData.historicalAPY)) {
        historicalAPY = responseData.historicalAPY;
      }

      const mappedData: HistoricalAPYResponse['data'] = {
        vault: params.vault,
        asset: responseData.input_token || responseData.asset || params.asset,
        historicalAPY,
        currentAPY: responseData.current_apy || responseData.apy || responseData.currentAPY,
        averageAPY: responseData.average_apy || responseData.averageAPY,
      };

      // If we have historical data but no current/average, calculate it
      if (!mappedData.currentAPY && !mappedData.averageAPY && historicalAPY.length > 0) {
        const sum = historicalAPY.reduce((acc, point) => acc + point.apy, 0);
        mappedData.averageAPY = sum / historicalAPY.length;
        mappedData.currentAPY = historicalAPY[historicalAPY.length - 1]?.apy || mappedData.averageAPY;
      }

      return {
        success: true,
        data: mappedData,
      };
    } catch (error) {
      console.error(`[GlueXYieldsService] Error fetching historical APY:`, error);

      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: false,
        error: "Unknown error occurred while fetching historical APY",
      };
    }
  }

  /**
   * Get current yield opportunities across all whitelisted vaults
   * @param vaultAddresses Array of vault addresses to check
   * @param chainID Chain ID (default: hyperevm)
   * @returns Array of yield opportunities sorted by APY (descending)
   */
  async getYieldOpportunities(
    vaultAddresses: string[],
    chainID: string = "hyperevm"
  ): Promise<YieldOpportunity[]> {
    const opportunities: YieldOpportunity[] = [];

    console.log(
      `[GlueXYieldsService] Fetching yield opportunities for ${vaultAddresses.length} vaults...`
    );

    // Fetch APY data for each vault
    for (const vault of vaultAddresses) {
      try {
        const response = await this.getHistoricalAPY({
          chainID,
          vault,
          lpTokenAddress: vault, // For ERC-4626 vaults, lp_token_address is the vault itself
          // timeRange parameter not used in current API format
        });

        if (response.success && response.data) {
          // Use currentAPY if available, otherwise use averageAPY, otherwise calculate from historical
          let apy = response.data.currentAPY || response.data.averageAPY || 0;
          
          // Calculate average APY from historical data if available and no current/average
          if (apy === 0 && response.data.historicalAPY && response.data.historicalAPY.length > 0) {
            const sum = response.data.historicalAPY.reduce(
              (acc, point) => acc + point.apy,
              0
            );
            apy = sum / response.data.historicalAPY.length;
          }

          // Only add if we have valid APY data
          if (apy > 0) {
            opportunities.push({
              vault,
              asset: response.data.asset || "unknown",
              apy: apy,
              apr: response.data.currentAPY || apy,
              timestamp: Date.now(),
            });
          } else {
            console.log(`⚠️  No APY data found for vault ${vault}`);
          }
        } else {
          console.log(`⚠️  Failed to get APY data for vault ${vault}:`, response.error);
        }
      } catch (error) {
        console.error(
          `[GlueXYieldsService] Error fetching APY for vault ${vault}:`,
          error
        );
        // Continue with other vaults even if one fails
      }
    }

    // Sort by APY (highest first)
    opportunities.sort((a, b) => b.apy - a.apy);

    console.log(
      `[GlueXYieldsService] Found ${opportunities.length} yield opportunities`
    );

    return opportunities;
  }

  /**
   * Find the highest yielding vault for a given asset
   * @param asset Asset address or symbol
   * @param vaultAddresses Array of vault addresses to check
   * @param chainID Chain ID (default: hyperevm)
   * @returns Best yield opportunity or null if none found
   */
  async findBestYieldForAsset(
    asset: string,
    vaultAddresses: string[],
    chainID: string = "hyperevm"
  ): Promise<YieldOpportunity | null> {
    const opportunities = await this.getYieldOpportunities(vaultAddresses, chainID);
    
    // Filter by asset if provided
    const assetOpportunities = asset
      ? opportunities.filter((opp) => opp.asset.toLowerCase() === asset.toLowerCase())
      : opportunities;

    return assetOpportunities.length > 0 ? assetOpportunities[0] : null;
  }
}

