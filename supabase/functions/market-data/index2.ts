import { createClient } from 'npm:@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  try {
    const url = new URL(req.url);
    const symbols = url.searchParams.get('symbols');
    const fromDate = url.searchParams.get('from_date');
    const toDate = url.searchParams.get('to_date');
    const timeframe = url.searchParams.get('timeframe') || 'M5';

    // Validate required parameters
    if (!symbols) {
      throw new Error('Missing required parameter: symbols');
    }
    if (!fromDate) {
      throw new Error('Missing required parameter: from_date');
    }
    if (!toDate) {
      throw new Error('Missing required parameter: to_date');
    }

    // Validate date formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fromDate) || !dateRegex.test(toDate)) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }

    // Validate timeframe
    const validTimeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
    if (!validTimeframes.includes(timeframe)) {
      throw new Error(`Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}`);
    }

    // Validate symbols (assuming EURUSD and XAUUSD are the only valid symbols)
    const validSymbols = ['EURUSD', 'XAUUSD'];
    if (!validSymbols.includes(symbols)) {
      throw new Error(`Invalid symbol. Must be one of: ${validSymbols.join(', ')}`);
    }

    console.log('Fetching market data:', { symbols, fromDate, toDate, timeframe });

    const apiUrl = `https://test.neuix.host/api/market-data/get?from_date=${fromDate}&to_date=${toDate}&timeframe=${timeframe}&symbols=${symbols}`;
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('External API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      throw new Error(`External API error: ${response.status} - ${errorData || response.statusText}`);
    }

    const data = await response.json();

    return new Response(
      JSON.stringify(data),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error:', error.message);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 400, // Using 400 for validation errors
      }
    );
  }
});