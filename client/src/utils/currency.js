/** Format a number as Nepali Rupees */
export const formatNPR = (amount) => {
  if (amount === null || amount === undefined) return '—';
  return `Rs. ${Number(amount).toLocaleString('en-NP')}`;
};

/** Short format e.g. Rs. 1,200 */
export const npr = (amount) => formatNPR(amount);
