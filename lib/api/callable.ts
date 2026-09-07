import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "@/lib/firebase/functions";

type Schema<T> = { parse(value: unknown): T };

export async function callBackend<Input, Output>(
  name: string,
  input: Input,
  inputSchema: Schema<Input>,
  outputSchema: Schema<Output>,
): Promise<Output> {
  const payload = inputSchema.parse(input);
  const result = await httpsCallable<Input, unknown>(getFirebaseFunctions(), name)(payload);
  return outputSchema.parse(result.data);
}
