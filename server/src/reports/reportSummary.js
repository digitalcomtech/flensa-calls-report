const ANSWERED_STATUSES = new Set(['completed']);

export function isAnsweredCall(status) {
  return ANSWERED_STATUSES.has(status);
}

function percentage(count, total) {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

export function buildSummary(calls) {
  const totalCalls = calls.length;
  const answeredCount = calls.filter((call) => isAnsweredCall(call.status)).length;
  const notAnsweredCount = totalCalls - answeredCount;

  return {
    totalCalls,
    answered: {
      count: answeredCount,
      percentage: percentage(answeredCount, totalCalls),
    },
    notAnswered: {
      count: notAnsweredCount,
      percentage: percentage(notAnsweredCount, totalCalls),
    },
  };
}
