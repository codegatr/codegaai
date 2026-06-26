"use strict";

function createBackgroundJobManager(progressBus = null) {
  const jobs = new Map();

  function startJob({ id, label, run }) {
    const jobId = id || `job-${Date.now().toString(36)}`;
    if (jobs.has(jobId)) return jobs.get(jobId).promise;
    const state = {
      id: jobId,
      label: label || jobId,
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: null,
      error: null,
    };
    progressBus?.started?.(jobId, state.label);
    const promise = Promise.resolve()
      .then(() => run(state))
      .then((result) => {
        state.status = "completed";
        state.finishedAt = new Date().toISOString();
        state.result = result;
        progressBus?.completed?.(jobId, state.label);
        return state;
      })
      .catch((error) => {
        state.status = "failed";
        state.finishedAt = new Date().toISOString();
        state.error = error.message || String(error);
        progressBus?.failed?.(jobId, state.label, state.error);
        return state;
      });
    state.promise = promise;
    jobs.set(jobId, state);
    return promise;
  }

  function getJob(id) {
    return jobs.get(id) || null;
  }

  function listJobs() {
    return [...jobs.values()].map(({ promise, ...job }) => job);
  }

  return {
    startJob,
    getJob,
    listJobs,
  };
}

module.exports = {
  createBackgroundJobManager,
};
