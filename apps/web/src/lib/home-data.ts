type HomeDataLoaders<Entry, Summary> = {
  loadEntries: () => Promise<Entry[]>;
  loadSummaries: () => Promise<Summary[]>;
};

export async function loadHomeData<Entry, Summary>({
  loadEntries,
  loadSummaries,
}: HomeDataLoaders<Entry, Summary>) {
  const [entriesResult, summariesResult] = await Promise.allSettled([
    Promise.resolve().then(loadEntries),
    Promise.resolve().then(loadSummaries),
  ]);

  return {
    entries: entriesResult.status === "fulfilled" ? entriesResult.value : [],
    summaries:
      summariesResult.status === "fulfilled" ? summariesResult.value : [],
  };
}
