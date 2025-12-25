var util = require('./util');
var lc = require('./leetcode');
var ai = require('./openai');

function supportLanguages() {
  return ['auto', 'zh-Hans', 'en'];
}

function translate(query, completion) {
  var options = $option || {};
  var apiKey = options.apiKey;
  if (!apiKey) {
    var err = util.buildError('secretKey', '请在插件设置中填写 OpenAI API Key');
    if (query.onCompletion) query.onCompletion({ error: err });
    else completion(err);
    return;
  }
  var apiBaseUrl = options.apiBaseUrl || 'https://api.openai.com';
  var model = options.model || 'gpt-4o-mini';
  var stream = typeof options.stream === 'boolean' ? options.stream : true;
  var enableLeetCodeFetch = typeof options.enableLeetCodeFetch === 'boolean' ? options.enableLeetCodeFetch : true;
  var timeoutSeconds = options.timeoutSeconds || 60;
  var maxCandidates = options.maxCandidates || 3;
  var debug = !!options.debug;

  var parsed = util.parseInput(query.text);
  util.safeLog(debug, 'parsed input: ' + JSON.stringify(parsed));

  if (parsed.type === 'empty') {
    var errEmpty = util.buildError('param', '未检测到内容');
    if (query.onCompletion) query.onCompletion({ error: errEmpty });
    else completion(errEmpty);
    return;
  }

  function proceedWithProblem(problemText, meta) {
    var userPrompt = ai.buildUserPrompt(problemText, meta || {});
    var params = {
      apiKey: apiKey,
      apiBaseUrl: apiBaseUrl,
      model: model,
      timeoutSeconds: timeoutSeconds,
      stream: stream && !!query.onStream,
      cancelSignal: query.cancelSignal,
      userPrompt: userPrompt,
      onStream: query.onStream
    };
    ai
      .callOpenAI(params)
      .then(function (result) {
        var res = { result: { toParagraphs: result.toParagraphs, raw: result.raw } };
        if (query.onCompletion) query.onCompletion(res);
        else completion(null, res.result);
      })
      .catch(function (err) {
        var out = err && err.type ? err : util.buildError('unknown', err.message || '生成失败');
        if (query.onCompletion) query.onCompletion({ error: out });
        else completion(out);
      });
  }

  if (!enableLeetCodeFetch || parsed.type === 'statement') {
    proceedWithProblem(util.normalizeText(query.text), {});
    return;
  }

  // Fetch from LeetCode
  if (parsed.type === 'slug') {
    lc
      .fetchProblemDetails(parsed.value, query.cancelSignal, timeoutSeconds, debug)
      .then(function (resp) {
        var q = resp.question;
        var content = util.htmlToText(q.translatedContent || q.content, 12000);
        var meta = {
          title: q.translatedTitle || q.title,
          difficulty: q.difficulty,
          slug: q.titleSlug,
          tags: (q.topicTags || []).map(function (t) {
            return t.name;
          }),
          examples: util.normalizeText(q.exampleTestcases || ''),
          constraints: util.normalizeText(q.constraints || '')
        };
        var problemText = content;
        if (meta.examples) problemText += '\n示例：\n' + meta.examples;
        if (meta.constraints) problemText += '\n约束：\n' + meta.constraints;
        proceedWithProblem(problemText, meta);
      })
      .catch(function (err) {
        var out = err && err.type ? err : util.buildError('unknown', err.message || '拉取题目失败');
        if (query.onCompletion) query.onCompletion({ error: out });
        else completion(out);
      });
    return;
  }

  if (parsed.type === 'id') {
    lc
      .resolveById(parsed.value, query.cancelSignal, timeoutSeconds, debug)
      .then(function (info) {
        return lc.fetchProblemDetails(info.slug, query.cancelSignal, timeoutSeconds, debug, info.endpoint);
      })
      .then(function (resp) {
        var q = resp.question;
        var content = util.htmlToText(q.translatedContent || q.content, 12000);
        var meta = {
          title: q.translatedTitle || q.title,
          difficulty: q.difficulty,
          slug: q.titleSlug,
          tags: (q.topicTags || []).map(function (t) {
            return t.name;
          }),
          examples: util.normalizeText(q.exampleTestcases || ''),
          constraints: util.normalizeText(q.constraints || '')
        };
        var problemText = content;
        if (meta.examples) problemText += '\n示例：\n' + meta.examples;
        if (meta.constraints) problemText += '\n约束：\n' + meta.constraints;
        proceedWithProblem(problemText, meta);
      })
      .catch(function (err) {
        var out = err && err.type ? err : util.buildError('unknown', err.message || '拉取题目失败');
        if (query.onCompletion) query.onCompletion({ error: out });
        else completion(out);
      });
    return;
  }

  if (parsed.type === 'keyword') {
    lc
      .searchProblems(parsed.value, query.cancelSignal, timeoutSeconds, maxCandidates, debug)
      .then(function (result) {
        if (!result.list.length) throw util.buildError('notFound', '未找到相关题目');
        var candidate = result.list[0];
        if (result.list.length > 1 && parsed.value.length > 2) {
          // If multiple candidates, still use first but include list for model disambiguation
          candidate = result.list[0];
        }
        return lc.fetchProblemDetails(candidate.titleSlug, query.cancelSignal, timeoutSeconds, debug, result.endpoint);
      })
      .then(function (resp) {
        var q = resp.question;
        var content = util.htmlToText(q.translatedContent || q.content, 12000);
        var meta = {
          title: q.translatedTitle || q.title,
          difficulty: q.difficulty,
          slug: q.titleSlug,
          tags: (q.topicTags || []).map(function (t) {
            return t.name;
          }),
          examples: util.normalizeText(q.exampleTestcases || ''),
          constraints: util.normalizeText(q.constraints || '')
        };
        var problemText = content;
        if (meta.examples) problemText += '\n示例：\n' + meta.examples;
        if (meta.constraints) problemText += '\n约束：\n' + meta.constraints;
        proceedWithProblem(problemText, meta);
      })
      .catch(function (err) {
        var out = err && err.type ? err : util.buildError('unknown', err.message || '检索题目失败');
        if (query.onCompletion) query.onCompletion({ error: out });
        else completion(out);
      });
    return;
  }

  // fallback
  proceedWithProblem(util.normalizeText(query.text), {});
}

module.exports = {
  supportLanguages: supportLanguages,
  translate: translate
};
