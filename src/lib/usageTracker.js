export async function logCall(data) {
  console.log('[Usage Tracker] Logged call:', data);
  return { success: true };
}
