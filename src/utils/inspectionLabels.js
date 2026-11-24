export const getClassLabel = (selectedModel, regionId) => (
  selectedModel ? `${selectedModel}::${regionId}` : String(regionId)
);
