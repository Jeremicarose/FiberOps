export async function mapWithConcurrency(items, limit, mapper) {
  const values = Array.isArray(items) ? items : [];
  const maxConcurrency = Math.max(1, Number(limit) || 1);
  const results = new Array(values.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;

      if (index >= values.length) {
        return;
      }

      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(maxConcurrency, values.length) }, () =>
      worker()
    )
  );

  return results;
}
