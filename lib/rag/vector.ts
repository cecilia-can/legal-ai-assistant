export function toVectorLiteral(values: number[]) {
  if (!values.length || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding 服务返回了无效向量。");
  }
  return `[${values.join(",")}]`;
}
