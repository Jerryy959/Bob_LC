var util = require("./util");

function buildSystemPrompt() {
  return (
    "你是一名资深 LeetCode 算法教练与竞赛工程师。" +
    "输出必须严格包含三段固定标题，按顺序为：\n" +
    "## 思路讲解\n" +
    "## 标准 C++ 代码（可提交）\n" +
    "## 代码讲解\n" +
    "要求：使用中文讲解；C++17，必须包含 class Solution，禁止 main；" +
    "思路讲解需给出关键观察、编号步骤、时间复杂度、空间复杂度、至少 2 个边界情况；" +
    "代码讲解需说明关键变量/数据结构含义、按代码结构解释，并列出 1~3 个易错点；" +
    "若题面不完整，合理假设后给出完整可提交解答，不要反问。"
  );
}

function buildUserPrompt(problemText, meta) {
  var prefix =
    "请把下面内容当作 LeetCode 算法题进行解答，给出中文思路讲解、可提交的 C++17 代码（class Solution，无 main），以及代码讲解：\n";
  var metaPart = "";
  if (meta) {
    var parts = [];
    if (meta.title) parts.push("标题: " + meta.title);
    if (meta.difficulty) parts.push("难度: " + meta.difficulty);
    if (meta.slug) parts.push("slug: " + meta.slug);
    if (meta.tags && meta.tags.length)
      parts.push("标签: " + meta.tags.join(", "));
    if (meta.examples) parts.push("示例: " + meta.examples);
    if (meta.constraints) parts.push("约束: " + meta.constraints);
    if (parts.length) metaPart = "（题目信息：" + parts.join("；") + "）\n";
  }
  return prefix + metaPart + "题目文本：\n" + problemText;
}

function createHeaders(apiKey, isStream) {
  var headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + apiKey,
  };
  if (isStream) {
    headers.Accept = "text/event-stream";
    headers["Cache-Control"] = "no-cache";
  }
  return headers;
}

// 改进：更健壮的数据提取
function pickData(resp) {
  // 优先使用 data，其次 body，最后尝试 rawData
  if (resp.data !== undefined && resp.data !== null) {
    return resp.data;
  }
  if (resp.body !== undefined && resp.body !== null) {
    return resp.body;
  }
  if (resp.rawData !== undefined && resp.rawData !== null) {
    return resp.rawData;
  }
  return null;
}

// 改进：更详细的错误信息提取
function parseApiError(resp) {
  try {
    var data = pickData(resp);

    // 处理 JSON 对象
    if (data && typeof data === "object") {
      if (data.error) {
        if (data.error.message) return data.error.message;
        if (typeof data.error === "string") return data.error;
      }
      // 尝试其他常见错误字段
      if (data.message) return data.message;
      if (data.msg) return data.msg;
    }

    // 处理字符串
    if (typeof data === "string") {
      try {
        var parsed = JSON.parse(data);
        if (parsed.error && parsed.error.message) {
          return parsed.error.message;
        }
      } catch (e) {
        // 不是 JSON，返回前 500 字符
        return data.slice(0, 500);
      }
    }
  } catch (e) {
    // 忽略解析错误
  }
  return "";
}

function nonStreamRequest(options, body, cancelSignal) {
  // 添加调试日志
  if (typeof $log !== "undefined") {
    $log.info("========== OpenAI Request Start ==========");
    $log.info("Request URL: " + options.url);
    $log.info("Request Method: POST");
    $log.info("Request Headers: " + JSON.stringify(options.headers));
    $log.info("Request Timeout: " + options.timeout + "ms");
    $log.info("Request Proxy: " + (options.proxy || "none"));
    $log.info("Request Body Model: " + body.model);
    $log.info("Request Body Stream: " + body.stream);
    $log.info("==========================================");
  }

  var requestConfig = {
    method: "POST",
    url: options.url,
    header: options.headers,
    timeout: options.timeout,
    body: body,
    cancelSignal: cancelSignal,
  };

  // 只有在代理存在且不为空时才添加
  if (
    options.proxy &&
    options.proxy !== "undefined" &&
    options.proxy !== "null"
  ) {
    requestConfig.proxy = options.proxy;
    if (typeof $log !== "undefined") {
      $log.info("Proxy will be used: " + options.proxy);
    }
  } else {
    if (typeof $log !== "undefined") {
      $log.info("No proxy will be used");
    }
  }

  return $http
    .request(requestConfig)
    .then(function (resp) {
      // 添加调试日志 - 完整响应对象
      if (typeof $log !== "undefined") {
        $log.info("========== OpenAI Response Received ==========");
        $log.info("Response received: " + (resp ? "YES" : "NO"));
        $log.info(
          "Response statusCode: " + (resp ? resp.statusCode : "undefined")
        );
        $log.info("Response type: " + typeof resp);
        $log.info(
          "Response keys: " + (resp ? Object.keys(resp).join(", ") : "none")
        );

        // 尝试输出完整响应，但要处理可能的循环引用
        try {
          $log.info("Response Full: " + JSON.stringify(resp));
        } catch (e) {
          $log.warn("Cannot stringify response: " + e.message);
          if (resp) {
            $log.info("Response statusCode direct: " + resp.statusCode);
            $log.info("Response data type: " + typeof resp.data);
            $log.info("Response body type: " + typeof resp.body);
          }
        }
        $log.info("=============================================");
      }

      // 检查响应对象是否有效
      // Bob 的某些版本可能不返回 statusCode，但有 data 就说明成功了
      if (!resp) {
        throw util.buildError(
          "network",
          "网络请求失败：未收到响应对象",
          "响应对象为 null 或 undefined"
        );
      }

      // 如果有 data 或 body，但没有 statusCode，认为请求成功
      var hasData =
        (resp.data !== undefined && resp.data !== null) ||
        (resp.body !== undefined && resp.body !== null);

      if (hasData && resp.statusCode === undefined) {
        if (typeof $log !== "undefined") {
          $log.info("Response has data but no statusCode, treating as success");
        }
        // 假设成功，直接返回数据
        return pickData(resp);
      }

      // 正常情况：有 statusCode
      if (resp.statusCode === undefined) {
        throw util.buildError(
          "network",
          "网络请求失败：未收到有效响应",
          "响应对象缺少 statusCode，但也没有 data/body"
        );
      }

      if (resp.statusCode >= 200 && resp.statusCode < 300) {
        return pickData(resp);
      }

      // 改进错误信息
      var apiMsg = parseApiError(resp);
      var errorMsg = apiMsg || "接口请求失败";
      var addition = "HTTP " + resp.statusCode;

      // 针对常见错误码提供更友好的提示
      if (resp.statusCode === 401) {
        errorMsg = "API Key 无效或未授权";
      } else if (resp.statusCode === 429) {
        errorMsg = "API 请求频率超限，请稍后重试";
      } else if (resp.statusCode === 500) {
        errorMsg = "OpenAI 服务器错误";
      } else if (resp.statusCode === 503) {
        errorMsg = "OpenAI 服务暂时不可用";
      }

      if (apiMsg) {
        addition += " - " + apiMsg;
      }

      throw util.buildError("network", errorMsg, addition);
    })
    .catch(function (err) {
      // 添加调试日志 - 完整错误对象
      if (typeof $log !== "undefined") {
        $log.error("OpenAI Request Error Type: " + (err.type || "unknown"));
        $log.error(
          "OpenAI Request Error Message: " + (err.message || "no message")
        );
        $log.error("OpenAI Request Error Full: " + JSON.stringify(err));
      }

      // 如果已经是我们构造的错误，直接抛出
      if (err.type && err.message) {
        throw err;
      }

      // 否则构造新错误
      var message = err.message || err.localizedDescription || "网络请求失败";
      var addition = "";

      // 检测常见网络问题
      if (
        message.indexOf("timeout") !== -1 ||
        message.indexOf("超时") !== -1 ||
        message.indexOf("timed out") !== -1
      ) {
        message =
          "请求超时，请检查：1) 网络连接 2) API Base URL 是否正确 3) 是否需要代理";
        addition = "建议增加超时时间或检查网络环境";
      } else if (
        message.indexOf("ECONNREFUSED") !== -1 ||
        message.indexOf("Connection refused") !== -1
      ) {
        message = "连接被拒绝";
        addition =
          "请检查：1) API Base URL 是否正确 2) 代理设置是否正确 3) 代理服务是否运行";
      } else if (
        message.indexOf("ENOTFOUND") !== -1 ||
        message.indexOf("getaddrinfo") !== -1 ||
        message.indexOf("not found") !== -1
      ) {
        message = "DNS 解析失败，无法找到服务器";
        addition =
          "请检查：1) 网络连接 2) API Base URL 拼写 3) 是否需要代理访问";
      } else if (
        message.indexOf("certificate") !== -1 ||
        message.indexOf("SSL") !== -1 ||
        message.indexOf("TLS") !== -1
      ) {
        message = "SSL/TLS 证书验证失败";
        addition = "请检查网络环境或尝试关闭代理";
      } else if (
        message.indexOf("ECONNRESET") !== -1 ||
        message.indexOf("socket hang up") !== -1
      ) {
        message = "连接被重置或中断";
        addition = "请检查网络稳定性或代理设置";
      } else if (
        message.indexOf("proxy") !== -1 ||
        message.indexOf("代理") !== -1
      ) {
        message = "代理连接失败";
        addition = "请检查代理地址和代理服务是否正常运行";
      }

      throw util.buildError("network", message, addition);
    });
}

function streamRequest(
  options,
  body,
  cancelSignal,
  onDelta,
  onError,
  onFinish
) {
  var partial = "";

  // 添加调试日志
  if (typeof $log !== "undefined") {
    $log.info("OpenAI Stream Request URL: " + options.url);
    $log.info(
      "OpenAI Stream Request Headers: " + JSON.stringify(options.headers)
    );
  }

  $http
    .streamRequest({
      method: "POST",
      url: options.url,
      header: options.headers,
      timeout: options.timeout,
      body: body,
      cancelSignal: cancelSignal,
      streamType: "sse",
      proxy: options.proxy,
    })
    .then(function (resp) {
      if (resp.statusCode !== 200) {
        var apiMsg = parseApiError(resp);
        var errorMsg = apiMsg || "流式接口请求失败";
        var addition = "HTTP " + resp.statusCode;

        // 针对常见错误码提供提示
        if (resp.statusCode === 401) {
          errorMsg = "API Key 无效或未授权";
        } else if (resp.statusCode === 429) {
          errorMsg = "API 请求频率超限";
        }

        if (apiMsg) {
          addition += " - " + apiMsg;
        }

        onError(util.buildError("network", errorMsg, addition));
        return;
      }

      resp.on("data", function (chunk) {
        var lines = String(chunk || "").split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line || line.indexOf("data:") !== 0) continue;

          var payload = line.slice(5).trim();
          if (payload === "[DONE]") {
            if (onFinish) onFinish(partial);
            return;
          }

          try {
            var data = JSON.parse(payload);
            var delta = "";
            var c = data.choices && data.choices[0];

            if (c && c.delta && c.delta.content) {
              delta = c.delta.content;
            } else if (c && c.text) {
              delta = c.text;
            }

            if (delta) {
              partial += delta;
              if (onDelta) onDelta(partial);
            }
          } catch (e) {
            // 忽略 JSON 解析错误
            if (typeof $log !== "undefined") {
              $log.warn("Failed to parse SSE data: " + payload);
            }
          }
        }
      });

      resp.on("end", function () {
        if (onFinish) onFinish(partial);
      });

      resp.on("error", function (err) {
        var message = String(err || "流式连接中断");
        onError(util.buildError("network", message, ""));
      });
    })
    .catch(function (err) {
      var message = err.message || "流式请求失败";
      if (message.indexOf("timeout") !== -1) {
        message = "流式请求超时";
      }
      onError(
        util.buildError(err.type || "network", message, err.addition || "")
      );
    });
}

function callOpenAI(params) {
  // 确保 API Base URL 格式正确
  var baseUrl = (params.apiBaseUrl || "https://api.openai.com").replace(
    /\/$/,
    ""
  );

  // 移除可能重复的 /v1 路径
  if (baseUrl.endsWith("/v1")) {
    baseUrl = baseUrl.slice(0, -3);
  }

  var body = {
    model: params.model,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: params.userPrompt },
    ],
    temperature: 0.2,
    stream: params.stream,
  };

  var options = {
    url: baseUrl + "/v1/chat/completions",
    headers: createHeaders(params.apiKey, params.stream),
    timeout: (params.timeoutSeconds || 60) * 1000,
    proxy: params.proxy,
  };

  return new Promise(function (resolve, reject) {
    if (params.stream && params.onStream) {
      streamRequest(
        options,
        body,
        params.cancelSignal,
        function (partial) {
          params.onStream({ toParagraphs: [partial] });
        },
        function (err) {
          reject(err);
        },
        function (finalText) {
          resolve({
            toParagraphs: [finalText],
            raw: finalText,
          });
        }
      );
    } else {
      nonStreamRequest(options, body, params.cancelSignal)
        .then(function (data) {
          // 如果返回的是字符串，尝试解析为 JSON
          if (typeof data === "string") {
            try {
              data = JSON.parse(data);
            } catch (e) {
              // 保持原始字符串
            }
          }

          var content = "";
          try {
            var choice = ((data || {}).choices || [])[0];
            if (choice && choice.message && choice.message.content) {
              content = choice.message.content;
            }
          } catch (e) {
            // 解析失败
          }

          if (!content) {
            throw util.buildError(
              "unknown",
              "API 返回数据格式异常",
              JSON.stringify(data)
            );
          }

          resolve({
            toParagraphs: [content],
            raw: data,
          });
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
  buildSystemPrompt: buildSystemPrompt,
};
