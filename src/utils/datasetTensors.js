import * as tf from '@tensorflow/tfjs';

export const serializeDataset = (dataset) => {
  if (!dataset) return null;
  const result = {};
  Object.keys(dataset).forEach((classId) => {
    const tensor = dataset[classId];
    result[classId] = { data: Array.from(tensor.dataSync()), shape: tensor.shape };
  });
  return result;
};

export const deserializeDataset = (obj) => {
  if (!obj) return null;
  const result = {};
  Object.keys(obj).forEach((classId) => {
    const { data, shape } = obj[classId];
    result[classId] = tf.tensor(data, shape);
  });
  return result;
};
