import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "@/lib/firebase/functions";
import { toUserMessage } from "@/lib/errors";

type Schema<T> = { parse(value: unknown): T };

export async function callBackend<Input, Output>(
  name: string,
  input: Input,
  inputSchema: Schema<Input>,
  outputSchema: Schema<Output>,
): Promise<Output> {
  const payload = inputSchema.parse(input);
  try {
    const result = await httpsCallable<Input, unknown>(getFirebaseFunctions(), name)(payload);
    return outputSchema.parse(result.data);
  } catch (error) {
    throw new Error(toUserMessage(error));
  }
}
