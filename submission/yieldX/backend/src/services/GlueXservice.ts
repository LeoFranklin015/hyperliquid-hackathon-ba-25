import "dotenv/config";

type QuoteParams = {
  chainID: string;
  inputToken: string;
  outputToken: string;
  inputAmount: string;
  userAddress: string;
  outputReceiver: string;
};

interface QuoteResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export async function getQuote(params: QuoteParams): Promise<QuoteResponse> {
  const url = "https://router.gluex.xyz/v1/quote";

  try {
    console.log(
      `[GlueXService] Starting quote request for ${params.inputAmount} tokens`
    );
    console.log(
      `[GlueXService] Chain: ${params.chainID}, Input: ${params.inputToken}, Output: ${params.outputToken}`
    );

    // Validate required environment variables
    if (!process.env.GLUEX_API_KEY) {
      throw new Error("GLUEX_API_KEY environment variable is not set");
    }

    if (!process.env.PID) {
      throw new Error("PID environment variable is not set");
    }

    // Validate input parameters
    if (
      !params.chainID ||
      !params.inputToken ||
      !params.outputToken ||
      !params.inputAmount ||
      !params.userAddress ||
      !params.outputReceiver
    ) {
      throw new Error("Missing required parameters for quote request");
    }

    const body = {
      chainID: params.chainID,
      inputToken: params.inputToken,
      outputToken: params.outputToken,
      inputAmount: params.inputAmount,
      orderType: "SELL",
      userAddress: params.userAddress,
      outputReceiver: params.outputReceiver,
      uniquePID: process.env.PID,
    };

    console.log(`[GlueXService] Request body:`, JSON.stringify(body, null, 2));

    const options: RequestInit = {
      method: "POST",
      headers: {
        "x-api-key": process.env.GLUEX_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    };

    console.log(`[GlueXService] Making request to ${url}`);
    const response = await fetch(url, options);

    console.log(`[GlueXService] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[GlueXService] HTTP error! Status: ${response.status}, Response: ${errorText}`
      );
      throw new Error(
        `HTTP error! Status: ${response.status}, Message: ${errorText}`
      );
    }

    const data = await response.json();
    console.log(
      `[GlueXService] Quote request successful:`,
      JSON.stringify(data, null, 2)
    );

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error(`[GlueXService] Error fetching quote:`, error);

    if (error instanceof Error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: "Unknown error occurred while fetching quote",
    };
  }
}
// Test function - should be removed in production or moved to a separate test file
const testQuote = async (): Promise<void> => {
  try {
    console.log(`[GlueXService] Starting test quote request`);

    const result = await getQuote({
      chainID: "arbitrum",
      inputToken: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      outputToken: "0x912ce59144191c1204e64559fe8253a0e49e6548",
      userAddress: "0x5A4830885f12438E00D8f4d98e9Fe083e707698C",
      outputReceiver: "0x5A4830885f12438E00D8f4d98e9Fe083e707698C",
      inputAmount: "1000",
    });

    if (result.success) {
      console.log(`[GlueXService] Test successful:`, result.data);
    } else {
      console.error(`[GlueXService] Test failed:`, result.error);
    }
  } catch (error) {
    console.error(`[GlueXService] Test execution failed:`, error);
  }
};

// Only run test if this file is executed directly (not imported)
if (require.main === module) {
  testQuote();
}
