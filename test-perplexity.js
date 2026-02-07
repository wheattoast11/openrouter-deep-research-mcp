const axios = require('axios');

async function testPerplexity() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  console.log('API Key present:', Boolean(apiKey));

  if (!apiKey) {
    console.log('No OPENROUTER_API_KEY set');
    return;
  }

  const systemPrompt = `You are a web search assistant. Search for information and return results as a VALID JSON ARRAY.

CRITICAL: Your entire response must be ONLY a valid JSON array with NO other text before or after.
Do NOT include markdown formatting, citations like [1], or any explanatory text.

Format each result EXACTLY like this:
[
  {"title": "Page Title Here", "url": "https://full-url-here.com/path", "snippet": "Brief description of the page content"},
  {"title": "Another Page", "url": "https://another-url.com", "snippet": "Another description"}
]

Requirements:
- Return 5 results maximum
- Each url must be a complete HTTPS URL
- Each title must be the actual page title
- Each snippet must be 1-2 sentences describing the content
- Do NOT use citation numbers like [1] or [source]
- Do NOT include any text before [ or after ]`;

  try {
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'perplexity/sonar-pro-search',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Search for: HVM interaction combinators Bend language' }
      ],
      temperature: 0.1,
      max_tokens: 2000
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/anthropics/claude-code',
        'X-Title': 'OpenRouter-Agents-MCP'
      },
      timeout: 30000
    });

    console.log('\n=== Response ===');
    console.log('Status:', response.status);
    console.log('Model:', response.data.model);
    console.log('\n=== Content ===');
    const content = response.data.choices?.[0]?.message?.content || '';
    console.log(content.substring(0, 2500));

    // Try to extract JSON
    console.log('\n=== JSON Extraction Test ===');
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('Parsed results:', JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.log('JSON parse failed:', e.message);
      }
    } else {
      console.log('No JSON array found in response');
    }
  } catch (e) {
    console.log('Error:', e.response?.data || e.message);
  }
}

testPerplexity();
