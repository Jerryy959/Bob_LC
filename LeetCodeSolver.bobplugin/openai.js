var util = require('./util');

function buildSystemPrompt() {
  return (
    '你是一名资深 LeetCode 算法教练与竞赛工程师。' +
    '输出必须严格包含三段固定标题，按顺序为：\n' +
    '## 思路讲解\n' +
    '## 标准 C++ 代码（可提交）\n' +
    '## 代码讲解\n' +
    '要求：使用中文讲解；C++17，必须包含 class Solution，禁止 main；' +
    '思路讲解需给出关键观察、编号步骤、时间复杂度、空间复杂度、至少 2 个边界情况；' +
    '代码讲解需说明关键变量/数据结构含义、按代码结构解释，并列出 1~3 个易错点；' +
    '若题面不完整，合理假设后给出完整可提交解答，不要反问。'
  );
}

function buildUserPrompt(problemText, meta) {
  var prefix = '请把下面内容当作 LeetCode 算法题进行解答，给出中文思路讲解、可提交的 C++17 代码（class Solution，无 main），以及代码讲解：\n';
  var metaPart = '';
  if (meta) {
    var parts = [];
    if (meta.title) parts.push('标题: ' + meta.title);
    if (meta.difficulty) parts.push('难度: ' + meta.difficulty);
    if (meta.slug) parts.push('slug: ' + meta.slug);
    if (meta.tags && meta.tags.length) parts.push('标签: ' + meta.tags.join(', '));
    if (meta.examples) parts.push('示例: ' + meta.examples);
    if (meta.constraints) parts.push('约束: ' + meta.constraints);
    if (parts.length) metaPart = '（题目信息：' + parts.join('；') + '）\n';
  }
  return prefix + metaPart + '题目文本：\n' + problemText;
}

function createHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + apiKey
  };
}

function nonStreamRequest(options, body, cancelSignal) {
  return $http
    .request({
      method: 'POST',
      url: options.url,
      header: options.headers,
      timeout: options.timeout,
      body: body,
      cancelSignal: cancelSignal
    })
    .then(function (resp) {
      if (resp.statusCode >= 200 && resp.statusCode < 300) {
        return resp.data;
      }
      throw util.buildError('network', '接口请求失败', 'status: ' + resp.statusCode + ', body: ' + JSON.stringify(resp.data || resp.body));
    });
}

function streamRequest(options, body, cancelSignal, onDelta, onError, onFinish) {
  var partial = '';
  $http
    .streamRequest({
      method: 'POST',
      url: options.url,
      header: options.headers,
      timeout: options.timeout,
      body: body,
      cancelSignal: cancelSignal,
      streamType: 'sse'
    })
    .then(function (resp) {
      if (resp.statusCode !== 200) {
        onError(
          util.buildError('network', '接口请求失败', 'status: ' + resp.statusCode + ', body: ' + JSON.stringify(resp.data || resp.body))
        );
        return;
      }
      resp.on('data', function (chunk) {
        var lines = String(chunk || '').split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (!line || line.indexOf('data:') !== 0) continue;
          var payload = line.slice(5).trim();
          if (payload === '[DONE]') {
            if (onFinish) onFinish(partial);
            return;
          }
          try {
            var data = JSON.parse(payload);
            var delta = '';
            var c = data.choices && data.choices[0];
            if (c && c.delta && c.delta.content) delta = c.delta.content;
            else if (c && c.text) delta = c.text;
            if (delta) {
              partial += delta;
              if (onDelta) onDelta(partial);
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      });
      resp.on('end', function () {
        if (onFinish) onFinish(partial);
      });
      resp.on('error', function (err) {
        onError(util.buildError('network', '流式连接中断', String(err)));
      });
    })
    .catch(function (err) {
      onError(util.buildError(err.type || 'network', err.message || '请求失败', err.addition));
    });
}

function callOpenAI(params) {
  var body = {
    model: params.model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: params.userPrompt }
    ],
    temperature: 0.2,
    stream: params.stream
  };
  var options = {
    url: params.apiBaseUrl.replace(/\/$/, '') + '/v1/chat/completions',
    headers: createHeaders(params.apiKey),
    timeout: (params.timeoutSeconds || 60) * 1000
  };
  return new Promise(function (resolve, reject) {
    if (params.stream && params.onStream) {
      streamRequest(options, body, params.cancelSignal, function (partial) {
        params.onStream({ toParagraphs: [partial] });
      }, function (err) {
        reject(err);
      }, function (finalText) {
        resolve({
          toParagraphs: [finalText],
          raw: finalText
        });
      });
    } else {
      nonStreamRequest(options, body, params.cancelSignal)
        .then(function (data) {
          var content = '';
          try {
            content = (((data || {}).choices || [])[0] || {}).message || {};
            content = content.content || '';
          } catch (e) {
            content = '';
          }
          resolve({ toParagraphs: [content], raw: data });
        })
        .catch(function (err) {
          reject(err);
        });
    }
  });
}

module.exports = {
  callOpenAI: callOpenAI,
  buildUserPrompt: buildUserPrompt,
  buildSystemPrompt: buildSystemPrompt
};
