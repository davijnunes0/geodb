const buildQueryString = (params) => {
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(([_, v]) => v != null && v !== undefined)
  );
  return new URLSearchParams(cleanParams).toString();
};

module.exports = { buildQueryString };
