export interface MembershipApprovalResponse {
  memberId: string;
  decision: "APPROVE" | "REJECT";
}

export interface MembershipApproval {
  approvalId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "STALE";
  yesCount: number;
  noCount: number;
}

export interface MembershipApprovalRecalculation {
  approvalId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  yesCount: number;
  noCount: number;
  requiredYesCount: number;
  resolved: boolean;
}

export function recalculateMembershipApprovals(input: {
  approvals: ReadonlyArray<MembershipApproval & { responses: readonly MembershipApprovalResponse[] }>;
  activeMemberIds: readonly string[];
}): MembershipApprovalRecalculation[] {
  const activeMembers = new Set(input.activeMemberIds);
  const requiredYesCount = Math.floor(input.activeMemberIds.length / 2) + 1;

  return input.approvals.map(approval => {
    const yesCount = approval.responses.filter(
      response => activeMembers.has(response.memberId) && response.decision === "APPROVE",
    ).length;
    const noCount = approval.responses.filter(
      response => activeMembers.has(response.memberId) && response.decision === "REJECT",
    ).length;
    const status = yesCount >= requiredYesCount
      ? "APPROVED"
      : noCount >= requiredYesCount
        ? "REJECTED"
        : "PENDING";

    return {
      approvalId: approval.approvalId,
      status,
      yesCount,
      noCount,
      requiredYesCount,
      resolved: status !== "PENDING",
    };
  });
}
