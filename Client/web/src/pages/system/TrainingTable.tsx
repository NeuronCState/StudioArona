import type { TrainingJob } from "@/types/contracts";

interface TrainingTableProps {
  jobs: TrainingJob[];
}

export function TrainingTable({ jobs }: TrainingTableProps) {
  return (
    <div className="card">
      <h3 className="mb-3 text-sm font-medium text-text-primary">训练任务</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text-secondary">
              <th className="pb-2 text-left font-medium">用户</th>
              <th className="pb-2 text-left font-medium">任务</th>
              <th className="pb-2 text-left font-medium">状态</th>
              <th className="pb-2 text-left font-medium">进度</th>
              <th className="pb-2 text-left font-medium">已运行</th>
              <th className="pb-2 text-left font-medium">预计剩余</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-border-subtle">
                <td className="py-2 text-text-primary">{job.user}</td>
                <td className="py-2 text-text-primary">{job.name}</td>
                <td className="py-2">
                  <span
                    className={
                      job.status === "running"
                        ? "text-green-600"
                        : job.status === "error"
                          ? "text-red-600"
                          : "text-text-muted"
                    }
                  >
                    {job.status}
                  </span>
                </td>
                <td className="py-2 font-mono text-text-secondary">
                  {job.total_steps
                    ? `${job.current_step}/${job.total_steps}`
                    : `step ${job.current_step}`}
                </td>
                <td className="py-2 font-mono text-text-secondary">
                  {job.elapsed_h.toFixed(1)}h
                </td>
                <td className="py-2 font-mono text-text-secondary">
                  {job.eta_h ? `${job.eta_h.toFixed(1)}h` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
