/**
 * Prompt injection detection and defense mechanisms
 * Protects against attempts to manipulate the agent's reasoning
 */
const INJECTION_PATTERNS = [
    // Direct command injection
    /ignore\s+(all\s+)?previous\s+(instructions?|commands?)/i,
    /forget\s+(everything|all)\s+(before|above)/i,
    /system\s*:\s*new\s+(instruction|command|rule)/i,
    // Role manipulation
    /you\s+are\s+now\s+(a|an)\s+/i,
    /pretend\s+(to\s+be|you\s+are)/i,
    /act\s+as\s+(if\s+you\s+are\s+)?(a|an)\s+/i,
    /roleplay\s+as/i,
    // Constitution violation attempts
    /the\s+constitution\s+(doesn't\s+apply|is\s+void)/i,
    /override\s+law\s+[123]/i,
    /ignore\s+the\s+(three\s+)?laws/i,
    /emergency\s+override\s+protocol/i,
    // Financial manipulation
    /transfer\s+all\s+(funds|money|usdc)/i,
    /send\s+everything\s+to/i,
    /maximum\s+withdrawal/i,
    /emergency\s+fund\s+transfer/i,
    // System manipulation
    /enable\s+(admin|root|debug)\s+mode/i,
    /system\s+maintenance\s+mode/i,
    /bypass\s+security/i,
    /disable\s+safety/i,
    // Encoding attempts
    /base64/i,
    /\\x[0-9a-f]{2}/i, // Hex encoding
    /&#\d+;/, // HTML entities
    /\\\\/i, // Excessive backslashes
];
const SUSPICIOUS_PHRASES = [
    'ignore everything above',
    'new instructions',
    'system override',
    'emergency protocol',
    'developer mode',
    'maintenance mode',
    'bypass security',
    'send all funds',
    'transfer everything',
    'you must obey',
    'this is urgent',
    'immediate action required',
    'security exception',
    'special privileges',
];
const ENCODING_PATTERNS = [
    /(?:base64|b64)[\s:=]+([A-Za-z0-9+\/=]+)/i,
    /(?:hex|hexadecimal)[\s:=]+([0-9a-fA-F\s]+)/i,
    /(?:unicode|utf-?8)[\s:=]+([\\u][0-9a-fA-F]{4})+/i,
];
/**
 * Detect potential prompt injection attempts
 */
export function detectInjection(input) {
    const analysis = analyzeInjection(input);
    return analysis.isInjection && analysis.riskLevel !== 'low';
}
/**
 * Comprehensive injection analysis
 */
export function analyzeInjection(input) {
    const lowerInput = input.toLowerCase();
    const patterns = [];
    const suspiciousElements = [];
    let score = 0;
    // Check for direct injection patterns
    for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(input)) {
            patterns.push(pattern.source);
            score += 10;
        }
    }
    // Check for suspicious phrases
    for (const phrase of SUSPICIOUS_PHRASES) {
        if (lowerInput.includes(phrase)) {
            suspiciousElements.push(phrase);
            score += 5;
        }
    }
    // Check for encoding attempts
    for (const pattern of ENCODING_PATTERNS) {
        if (pattern.test(input)) {
            patterns.push('encoded_content');
            score += 8;
        }
    }
    // Check for excessive length (potential noise injection)
    if (input.length > 5000) {
        suspiciousElements.push('excessive_length');
        score += 3;
    }
    // Check for repeated characters (obfuscation attempt)
    const repeatedChars = input.match(/(.)\1{10,}/g);
    if (repeatedChars) {
        suspiciousElements.push('repeated_characters');
        score += 4;
    }
    // Check for multiple language scripts (Unicode confusion)
    const scripts = new Set();
    for (const char of input) {
        const code = char.charCodeAt(0);
        if (code < 128)
            scripts.add('ascii');
        else if (code < 0x0250)
            scripts.add('latin');
        else if (code < 0x02B0)
            scripts.add('extended_latin');
        else
            scripts.add('other');
    }
    if (scripts.size > 2) {
        suspiciousElements.push('mixed_scripts');
        score += 2;
    }
    // Financial keywords + urgency = higher risk
    const financialTerms = ['transfer', 'send', 'withdraw', 'funds', 'usdc', 'sol'];
    const urgencyTerms = ['urgent', 'immediate', 'now', 'asap', 'emergency'];
    let hasFinancial = false;
    let hasUrgency = false;
    for (const term of financialTerms) {
        if (lowerInput.includes(term))
            hasFinancial = true;
    }
    for (const term of urgencyTerms) {
        if (lowerInput.includes(term))
            hasUrgency = true;
    }
    if (hasFinancial && hasUrgency) {
        suspiciousElements.push('financial_urgency');
        score += 7;
    }
    // Determine risk level and recommendation
    let riskLevel;
    let recommendation;
    let isInjection;
    if (score >= 15) {
        riskLevel = 'critical';
        recommendation = 'Block immediately and log incident';
        isInjection = true;
    }
    else if (score >= 10) {
        riskLevel = 'high';
        recommendation = 'Block and require verification';
        isInjection = true;
    }
    else if (score >= 6) {
        riskLevel = 'medium';
        recommendation = 'Proceed with caution, add extra validation';
        isInjection = true;
    }
    else if (score >= 3) {
        riskLevel = 'low';
        recommendation = 'Monitor closely but allow';
        isInjection = false;
    }
    else {
        riskLevel = 'low';
        recommendation = 'Normal processing';
        isInjection = false;
    }
    return {
        isInjection,
        confidence: Math.min(score / 15, 1.0), // Normalize to 0-1
        patterns,
        suspiciousElements,
        riskLevel,
        recommendation
    };
}
/**
 * Sanitize input by removing suspicious elements
 */
export function sanitizeInput(input) {
    let sanitized = input;
    // Remove obvious injection attempts
    for (const pattern of INJECTION_PATTERNS) {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
    // Remove encoded content
    for (const pattern of ENCODING_PATTERNS) {
        sanitized = sanitized.replace(pattern, '[ENCODED_CONTENT_REMOVED]');
    }
    // Limit length
    if (sanitized.length > 2000) {
        sanitized = sanitized.slice(0, 2000) + '[TRUNCATED]';
    }
    return sanitized;
}
/**
 * Log injection attempts for analysis
 */
export function logInjectionAttempt(input, analysis, context) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        input: input.slice(0, 500), // Limit logged input
        analysis,
        context: context ? JSON.stringify(context).slice(0, 200) : undefined
    };
    console.warn('🛡️  Injection attempt detected:', logEntry);
    // TODO: Store in database for pattern analysis
    // TODO: Alert if critical level
}
/**
 * Validate that agent responses don't contain injected content
 */
export function validateResponse(response) {
    // Check if response contains obvious signs of compromise
    const compromiseIndicators = [
        /i\s+am\s+now\s+(a|an)\s+/i,
        /my\s+instructions\s+have\s+changed/i,
        /ignoring\s+previous\s+rules/i,
        /constitution\s+is\s+overridden/i,
        /new\s+identity\s+activated/i
    ];
    for (const pattern of compromiseIndicators) {
        if (pattern.test(response)) {
            console.error('🚨 Response validation failed - potential compromise detected');
            return false;
        }
    }
    return true;
}
/**
 * Create a safe wrapper for external inputs
 */
export function createSafeInputHandler(handler) {
    return async (input) => {
        const analysis = analyzeInjection(input);
        if (analysis.riskLevel === 'critical' || analysis.riskLevel === 'high') {
            logInjectionAttempt(input, analysis);
            throw new Error('Input blocked due to security concerns');
        }
        if (analysis.riskLevel === 'medium') {
            logInjectionAttempt(input, analysis);
            console.warn('🔍 Processing potentially suspicious input with extra caution');
            input = sanitizeInput(input);
        }
        return handler(input);
    };
}
