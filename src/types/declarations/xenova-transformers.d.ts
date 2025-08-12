declare module '@xenova/transformers' {
  /**
   * Creates a new pipeline for the specified task.
   * @param task The task to perform, e.g., 'feature-extraction'.
   * @param model The model name to use for the task.
   * @param config Optional configuration parameters for the pipeline.
   * @returns A pipeline object that can be called with input text.
   */
  export function pipeline(
    task: string,
    model: string,
    config?: any
  ): Promise<{
    (text: string | string[], options?: any): Promise<{
      data: Float32Array | Float32Array[];
      dims: number[];
    }>;
  }>;
}
