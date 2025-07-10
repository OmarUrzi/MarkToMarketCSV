import { createClient } from 'npm:@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse URL parameters
    const url = new URL(req.url);
    const fromDate = url.searchParams.get('from_date');
    const toDate = url.searchParams.get('to_date');
    const symbols = url.searchParams.get('symbols');
    const timeframe = url.searchParams.get('timeframe') || 'M5';

    console.log('Received request with params:', { fromDate, toDate, symbols, timeframe });

    // Validate required parameters
    if (!fromDate || !toDate || !symbols) {
      const missingParams = [];
      if (!fromDate) missingParams.push('from_date');
      if (!toDate) missingParams.push('to_date');
      if (!symbols) missingParams.push('symbols');

      return new Response(
        JSON.stringify({
          error: `Missing required parameters: ${missingParams.join(', ')}`,
          params: { fromDate, toDate, symbols }
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    // Validate date formats and ensure they are valid dates
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);

    if (!dateRegex.test(fromDate) || !dateRegex.test(toDate) || 
        isNaN(fromDateObj.getTime()) || isNaN(toDateObj.getTime())) {
      return new Response(
        JSON.stringify({
          error: 'Invalid date format or invalid date. Use YYYY-MM-DD format with valid dates',
          params: { fromDate, toDate }
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    // Validate timeframe
    const validTimeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
    if (!validTimeframes.includes(timeframe)) {
      return new Response(
        JSON.stringify({
          error: `Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}`,
          params: { timeframe }
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    // Validate symbols
    const validSymbols = ['EURUSD', 'XAUUSD'];
    if (!validSymbols.includes(symbols)) {
      return new Response(
        JSON.stringify({
          error: `Invalid symbol. Must be one of: ${validSymbols.join(', ')}`,
          params: { symbols }
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    // Make API call with validated parameters
    const apiUrl = `https://test.neuix.host/api/market-data/get?from_date=${fromDate}&to_date=${toDate}&timeframe=${timeframe}&symbols=${symbols}`;
    console.log('Calling external API:', apiUrl);
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          error: 'Missing Authorization header',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
    });

    console.log('API Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      
      return new Response(
        JSON.stringify({
          error: 'External API request failed',
          details: `Status ${response.status}: ${errorText}`,
        }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    const responseText = await response.text();
    console.log('Raw response:', responseText);

    try {
      // Clean the response text
      const cleanText = responseText
        .replace(/^\uFEFF/, '')  // Remove BOM
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .trim();

      // Find the JSON content boundaries
      const startIndex = cleanText.indexOf('{') !== -1 ? 
        cleanText.indexOf('{') : 
        cleanText.indexOf('[');
      
      const endIndex = cleanText.lastIndexOf('}') !== -1 ? 
        cleanText.lastIndexOf('}') + 1 : 
        cleanText.lastIndexOf(']') + 1;

      if (startIndex === -1 || endIndex === -1) {
        throw new Error('No valid JSON object or array found in response');
      }

      const jsonContent = cleanText.substring(startIndex, endIndex);
      const data = JSON.parse(jsonContent);
      
      if (typeof data !== 'object' || data === null) {
        throw new Error('Parsed data is not a valid JSON object or array');
      }

      return new Response(
        JSON.stringify(data),
        {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    } catch (parseError) {
      console.error('Failed to parse API response:', parseError);
      return new Response(
        JSON.stringify({
          error: 'Invalid API response format',
          details: parseError.message,
          type: 'PARSE_ERROR'
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
  } catch (error) {
    console.error('Function error:', error);
    
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch market data',
        details: error.message,
        type: 'MARKET_DATA_ERROR'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
});