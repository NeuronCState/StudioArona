import type { NetworkDevice } from "@/types/contracts";

interface NetworkTableProps {
  devices: NetworkDevice[];
}

export function NetworkTable({ devices }: NetworkTableProps) {
  return (
    <div className="card">
      <h3 className="mb-3 text-sm font-medium text-text-primary">网络设备</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text-secondary">
              <th className="pb-2 text-left font-medium">IP</th>
              <th className="pb-2 text-left font-medium">MAC</th>
              <th className="pb-2 text-left font-medium">主机名</th>
              <th className="pb-2 text-left font-medium">厂商</th>
              <th className="pb-2 text-left font-medium">在线</th>
              <th className="pb-2 text-left font-medium">最近活跃</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((dev) => (
              <tr key={dev.mac} className="border-b border-border-subtle">
                <td className="py-2 font-mono text-text-primary">{dev.ip}</td>
                <td className="py-2 font-mono text-text-secondary">
                  {dev.mac}
                </td>
                <td className="py-2 text-text-primary">{dev.hostname}</td>
                <td className="py-2 text-text-secondary">{dev.vendor}</td>
                <td className="py-2">
                  <span
                    className={
                      dev.online ? "text-green-600" : "text-text-muted"
                    }
                  >
                    {dev.online ? "在线" : "离线"}
                  </span>
                </td>
                <td className="py-2 text-text-muted">
                  {new Date(dev.last_seen).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
