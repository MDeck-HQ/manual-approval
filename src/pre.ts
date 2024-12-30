import * as core from "@actions/core";

function preprocess() {
  // validate the input
  // A message must be set
  const message = core.getInput("message");
  if (!message || message.trim() === "") {
    core.setFailed("The `message` input is required and cannot be empty");
    throw new Error("Message is required");
  }

  const timeout = core.getInput("timeout");
  if (timeout) {
    const timeoutValue = parseInt(timeout);
    if (isNaN(timeoutValue) || timeoutValue < 0) {
      core.setFailed("The `timeout` input must be a positive number");
      throw new Error("Invalid timeout value");
    }
  }
}

preprocess();
