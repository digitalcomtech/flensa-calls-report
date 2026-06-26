import { formatPercentage } from './formatters.js';

export function averageDurationSeconds(calls) {
  if (!calls?.length) {
    return 0;
  }

  const total = calls.reduce((sum, call) => sum + (Number(call.duration) || 0), 0);
  return total / calls.length;
}

export function buildSummaryTableRows(summary) {
  const totalCalls = summary?.totalCalls ?? 0;
  const answered = summary?.answered ?? { count: 0, percentage: 0 };
  const notAnswered = summary?.notAnswered ?? { count: 0, percentage: 0 };
  const totalPercentage = totalCalls > 0 ? '100.0' : '0';

  return [
    {
      concept: 'Contestadas',
      count: answered.count ?? 0,
      percentage: formatPercentage(answered.percentage),
    },
    {
      concept: 'Llamadas totales',
      count: totalCalls,
      percentage: totalPercentage,
    },
    {
      concept: 'No contestadas',
      count: notAnswered.count ?? 0,
      percentage: formatPercentage(notAnswered.percentage),
    },
  ];
}
