// Utility helpers for LeetCode Solver Bob plugin

function normalizeText(text) {
  if (!text) return '';
  return String(text).replace(/\r\n?/g, '\n').trim();
}

function htmlToText(html, maxLen) {
  if (!html) return '';
  var text = String(html);
  text = text.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script>/gi, '');
  text = text.replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style>/gi, '');
  text = text.replace(/<\s*(br|p)\s*\/?\s*>/gi, '\n');
  text = text.replace(/<\s*li\s*\/?\s*>/gi, function (m) {
    return m.indexOf('/') === -1 ? '\n- ' : '\n';
  });
  text = text.replace(/<\s*\/\s*(div|tr)\s*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  var entities = {
    '&nbsp;': ' ',
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'"
  };
  for (var k in entities) {
    text = text.split(k).join(entities[k]);
  }
  text = text.replace(/\n{3,}/g, '\n\n');
  text = normalizeText(text);
  if (maxLen && text.length > maxLen) {
    text = text.slice(0, maxLen) + '\n...';
  }
  return text;
}

function isProbablySentence(str) {
  if (!str) return false;
  if (str.length > 120) return true;
  return /[.。！？!?]/.test(str);
}

function parseInput(text) {
  var cleaned = normalizeText(text);
  if (!cleaned) return { type: 'empty', value: '' };
  var matchSlug = cleaned.match(/leetcode\.com\/problems\/([a-z0-9-]+)/i);
  if (matchSlug) {
    return { type: 'slug', value: matchSlug[1] };
  }
  var matchId = cleaned.match(/^(?:LC\s*|leetcode\s*|LeetCode\s*)?(\d{1,5})$/i);
  if (matchId) {
    return { type: 'id', value: matchId[1] };
  }
  if (cleaned.length < 80 && !isProbablySentence(cleaned)) {
    return { type: 'keyword', value: cleaned };
  }
  return { type: 'statement', value: cleaned };
}

function buildError(type, message, addition, troubleshootingLink) {
  return {
    type: type || 'unknown',
    message: message || '未知错误',
    addition: addition,
    troubleshootingLink: troubleshootingLink
  };
}

function safeLog(debug, msg) {
  if (debug && typeof $log !== 'undefined') {
    $log.info(msg);
  }
}

module.exports = {
  normalizeText: normalizeText,
  htmlToText: htmlToText,
  parseInput: parseInput,
  buildError: buildError,
  safeLog: safeLog
};
