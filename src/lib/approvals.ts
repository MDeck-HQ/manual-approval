import { DOT_DEPLOY_API_BASE_URL } from "./constants";
import * as core from "@actions/core";
import { HttpClient } from "@actions/http-client";

export interface ApprovalRequestPayload {
  repo_id: number;
  workflow_run_id: number;
  workflow_run_attempt: number;
  workflow_run_number: number;
  approvers?: string[];
}

export interface ApprovalRequestResponse {
  id: string;
}

export function getApprovalPayload(): ApprovalRequestPayload {
  const payload: ApprovalRequestPayload = {
    repo_id: Number(process.env.GITHUB_REPOSITORY_ID),
    workflow_run_id: Number(process.env.GITHUB_RUN_ID),
    workflow_run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    workflow_run_number: Number(process.env.GITHUB_RUN_NUMBER),
  };

  const approvers = core.getInput("approvers");
  if (approvers) {
    payload.approvers = approvers
      .split(",")
      .map(approver => approver.trim())
      .filter(Boolean);
  }

  return payload;
}

/**
 * Request approval for the current deployment
 * @returns Returns the approval ID (this can be used to request approval status)
 */
export async function requestApproval(): Promise<string> {
  const client = new HttpClient("dot-deploy");
  const payload = getApprovalPayload();

  const response = await client.postJson<ApprovalRequestResponse>(
    `${DOT_DEPLOY_API_BASE_URL}/actions/manual-approvals`,
    payload,
    {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    },
  );

  if (response.statusCode !== 200) {
    throw new Error(`Failed to request approval: ${response.statusCode}`);
  }

  core.debug("Successfully requested approval");
  core.debug(`Response: ${JSON.stringify(response.result)}`);

  if (!response.result?.id) {
    throw new Error("Failed to request approval: No approval ID returned");
  }

  return response.result.id;
}

export async function getApprovalStatus(approvalId: string): Promise<string> {
  const client = new HttpClient("dot-deploy");
  const response = await client.getJson<{ status: string }>(
    `${DOT_DEPLOY_API_BASE_URL}/actions/manual-approvals/${approvalId}/status`,
    // Skipping the auth header because this endpoint is not privileged
  );

  if (response.statusCode !== 200) {
    throw new Error(`Failed to get approval status: ${response.statusCode}`);
  }

  core.debug(`Approval status: ${response.result?.status}`);

  if (!response.result?.status) {
    throw new Error("Failed to get approval status: No status returned");
  }

  return response.result.status;
}
