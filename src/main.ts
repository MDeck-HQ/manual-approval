import * as core from "@actions/core";
import { getApprovalStatus, requestApproval } from "./lib/approvals";
import { APPROVAL_STATUS_POLL_INTERVAL } from "./lib/constants";

const run = async () => {
  const approvalId = await requestApproval();
  let timeout = parseInt(core.getInput("timeout"));

  if (isNaN(timeout) || timeout <= 0) {
    timeout = Infinity;
  } else {
    core.debug(`Will wait for approval for ${timeout} seconds`);
    timeout *= 1000; // Convert seconds to milliseconds
  }

  const start = Date.now();
  const end = start + timeout;

  // Poll for approval status until we get an approval or the timeout is reached
  while (Date.now() < end) {
    try {
      const status = await getApprovalStatus(approvalId);
      if (status === "approved") {
        core.info("Approval granted");
        return;
      } else if (status === "rejected") {
        core.setFailed("Approval rejected");
        return;
      }
    } catch (error) {
      core.warning(
        `Failed to get approval status. Will retry: ${(error as Error).message}`,
      );
    }

    await new Promise(resolve =>
      setTimeout(resolve, APPROVAL_STATUS_POLL_INTERVAL),
    );
  }

  core.setFailed("Approval timed out");
};

run().catch(error => {
  core.setFailed(error.message);
});
