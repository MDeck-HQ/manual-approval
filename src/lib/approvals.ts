import {
  DOT_DEPLOY_API_BASE_URL,
  DOT_DEPLOY_ARTIFACT_NAME,
  VERIFICATION_TOKEN_FILE_NAME,
} from "./constants";
import * as core from "@actions/core";
import { HttpClient } from "@actions/http-client";
import artifact, { ArtifactNotFoundError } from "@actions/artifact";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { nanoid } from "nanoid";

export interface ApprovalRequestPayload {
  artifact_id: number;
  verification_token: string;
  repo_id: number;
  workflow_run_id: number;
  workflow_run_attempt: number;
  workflow_run_number: number;
  approvers?: string[];
  message: string;
}

export interface ApprovalRequestResponse {
  id: string;
}

async function deleteArtifactIfExists(artifactName: string): Promise<void> {
  try {
    await artifact.deleteArtifact(artifactName);
  } catch (error) {
    if (error instanceof ArtifactNotFoundError) {
      core.debug(`Skipping deletion of '${artifactName}', it does not exist`);
      return;
    }

    // Best effort, we don't want to fail the action if this fails
    core.debug(`Unable to delete artifact: ${(error as Error).message}`);
  }
}

export async function uploadArtifact({
  name,
  content,
  filename,
}: {
  name: string;
  filename: string;
  content: string;
}) {
  // First try to delete the artifact if it exists
  await deleteArtifactIfExists(name);

  const appPrefix = "dot-deploy";
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), appPrefix));
  const file = path.join(tmpDir, filename);
  await fs.writeFile(file, content);

  const { id, size } = await artifact.uploadArtifact(name, [file], tmpDir, {
    retentionDays: 1,
    compressionLevel: 0,
  });

  return { id, size };
}

export function getApprovalPayload(
  id: number,
  verificationToken: string,
): ApprovalRequestPayload {
  const payload: ApprovalRequestPayload = {
    repo_id: Number(process.env.GITHUB_REPOSITORY_ID),
    workflow_run_id: Number(process.env.GITHUB_RUN_ID),
    workflow_run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    workflow_run_number: Number(process.env.GITHUB_RUN_NUMBER),
    artifact_id: id,
    verification_token: verificationToken,
    message: core.getInput("message"),
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
  const verificationToken = nanoid(32);
  const { id, size } = await uploadArtifact({
    name: DOT_DEPLOY_ARTIFACT_NAME,
    filename: VERIFICATION_TOKEN_FILE_NAME,
    content: verificationToken,
  });

  const client = new HttpClient("dot-deploy");
  const payload = getApprovalPayload(id as number, verificationToken);

  core.debug(`Created artifact ${id} with size ${size}`);
  core.debug("Requesting manual approval");

  const response = await client.postJson<ApprovalRequestResponse>(
    `${DOT_DEPLOY_API_BASE_URL}/actions/manual-approvals`,
    payload,
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
