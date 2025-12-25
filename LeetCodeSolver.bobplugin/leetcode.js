var util = require("./util");

var LC_ENDPOINT = "https://leetcode.com/graphql";
var CN_ENDPOINT = "https://leetcode.cn/graphql";

function graphqlRequest(
  endpoint,
  query,
  variables,
  cancelSignal,
  timeoutSeconds,
  debug,
  proxy
) {
  return $http
    .request({
      method: "POST",
      url: endpoint,
      header: {
        "Content-Type": "application/json",
        Referer:
          endpoint.indexOf("leetcode.cn") !== -1
            ? "https://leetcode.cn"
            : "https://leetcode.com",
        "User-Agent": "Bob-LeetCode-Solver",
      },
      timeout: timeoutSeconds * 1000,
      body: { query: query, variables: variables || {} },
      cancelSignal: cancelSignal,
      proxy: proxy || undefined,
    })
    .then(function (resp) {
      util.safeLog(debug, "LeetCode status: " + resp.statusCode);
      if (resp.statusCode >= 200 && resp.statusCode < 300) {
        return resp.data;
      }
      throw util.buildError(
        "network",
        "LeetCode 接口返回异常",
        "status: " +
          resp.statusCode +
          ", body: " +
          JSON.stringify(resp.data || resp.body)
      );
    });
}

function pickEndpoint(keyword) {
  if (/\p{Script=Han}/u.test(keyword)) return CN_ENDPOINT;
  return LC_ENDPOINT;
}

function searchProblems(
  keyword,
  cancelSignal,
  timeoutSeconds,
  maxCandidates,
  debug,
  proxy
) {
  var endpoint = pickEndpoint(keyword);
  var query = `query problemsetQuestionList($search: String!, $limit: Int!) {\n  problemsetQuestionList(searchKeyword: $search, limit: $limit) {\n    questions {\n      titleSlug\n      title\n      frontendQuestionId\n      difficulty\n    }\n  }\n}`;
  return graphqlRequest(
    endpoint,
    query,
    { search: keyword, limit: maxCandidates || 3 },
    cancelSignal,
    timeoutSeconds,
    debug,
    proxy
  ).then(function (data) {
    var list =
      (((data || {}).data || {}).problemsetQuestionList || {}).questions || [];
    return { endpoint: endpoint, list: list };
  });
}

function fetchProblemDetails(
  slug,
  cancelSignal,
  timeoutSeconds,
  debug,
  endpointOverride,
  proxy
) {
  var endpoint = endpointOverride || pickEndpoint(slug);
  var query = `query questionData($titleSlug: String!) {\n  question(titleSlug: $titleSlug) {\n    title\n    titleSlug\n    content\n    translatedTitle\n    translatedContent\n    difficulty\n    exampleTestcases\n    similarQuestions\n    topicTags { name slug }\n    constraints\n  }\n}`;
  return graphqlRequest(
    endpoint,
    query,
    { titleSlug: slug },
    cancelSignal,
    timeoutSeconds,
    debug,
    proxy
  ).then(function (data) {
    var q = ((data || {}).data || {}).question || null;
    if (!q) throw util.buildError("notFound", "未找到对应题目");
    return { endpoint: endpoint, question: q };
  });
}

function resolveById(id, cancelSignal, timeoutSeconds, debug, proxy) {
  var query = `query problemsetQuestionList($search: String!) {\n  problemsetQuestionList(searchKeyword: $search, limit: 1) {\n    questions { titleSlug title frontendQuestionId difficulty }\n  }\n}`;
  var endpoint = LC_ENDPOINT;
  return graphqlRequest(
    endpoint,
    query,
    { search: id },
    cancelSignal,
    timeoutSeconds,
    debug,
    proxy
  )
    .catch(function () {
      endpoint = CN_ENDPOINT;
      return graphqlRequest(
        endpoint,
        query,
        { search: id },
        cancelSignal,
        timeoutSeconds,
        debug,
        proxy
      );
    })
    .then(function (data) {
      var list =
        (((data || {}).data || {}).problemsetQuestionList || {}).questions ||
        [];
      if (!list.length) throw util.buildError("notFound", "未找到该题号");
      return { slug: list[0].titleSlug, endpoint: endpoint };
    });
}

module.exports = {
  searchProblems: searchProblems,
  fetchProblemDetails: fetchProblemDetails,
  resolveById: resolveById,
  pickEndpoint: pickEndpoint,
};
