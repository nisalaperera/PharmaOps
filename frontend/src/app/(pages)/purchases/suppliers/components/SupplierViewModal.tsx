"use client";

import { Modal }  from "@/components/ui/Modal";
import { Badge }  from "@/components/ui/Badge";
import {
  SUPPLIER_TYPE_LABEL, SUPPLIER_TYPE_VARIANT,
  CHANNEL_CATEGORY_VARIANT,
  CONTACT_TYPE_VARIANT,
} from "@/lib/badges";
import { DELIVERY_FREQUENCY_LABEL } from "@/lib/constants";
import type { Supplier, AgencyChannel, DistributorChannel, ChannelContact } from "@/types";

interface SupplierViewModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  supplier: Supplier | null;
}

function ContactsTable({ contacts }: { contacts: ChannelContact[] }) {
  if (contacts.length === 0) {
    return <p className="text-xs py-2" style={{ color: "var(--color-text-muted)" }}>No contacts.</p>;
  }
  return (
    <div className="rounded-lg overflow-auto border mt-2" style={{ borderColor: "var(--color-border)" }}>
      <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr style={{ background: "var(--color-surface-2)" }}>
            {["Name", "Mobile", "Landline", "WhatsApp", "Type"].map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contacts.map((c, idx) => (
            <tr key={idx} className="border-t" style={{ borderColor: "var(--color-border)" }}>
              <td className="px-3 py-2 font-medium" style={{ color: "var(--color-text)" }}>
                {c.title} {c.first_name} {c.last_name}
              </td>
              <td className="px-3 py-2 font-mono" style={{ color: "var(--color-text-muted)" }}>{c.mobile}</td>
              <td className="px-3 py-2 font-mono" style={{ color: "var(--color-text-muted)" }}>{c.landline || "—"}</td>
              <td className="px-3 py-2 font-mono" style={{ color: "var(--color-text-muted)" }}>{c.whatsapp || "—"}</td>
              <td className="px-3 py-2">
                <Badge variant={CONTACT_TYPE_VARIANT[c.contact_type]}>{c.contact_type}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgencyChannelDetail({ channel }: { channel: AgencyChannel }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{channel.channel_name}</span>
        {channel.product_mappings.length > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full border" style={{ color: "var(--color-text-muted)", borderColor: "var(--color-border)" }}>
            {channel.product_mappings.length} product{channel.product_mappings.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      {channel.product_mappings.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {channel.product_mappings.map((p) => (
            <span key={p.product_id} className="text-xs px-2 py-0.5 rounded-full border" style={{ color: "var(--color-text-muted)", borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
              {p.product_name}
            </span>
          ))}
        </div>
      )}
      <ContactsTable contacts={channel.contacts} />
    </div>
  );
}

function DistributorChannelDetail({ channel }: { channel: DistributorChannel }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{channel.channel_name}</span>
        <Badge variant={CHANNEL_CATEGORY_VARIANT[channel.channel_category]}>{channel.channel_category}</Badge>
        {channel.agency_name && (
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>via {channel.agency_name}</span>
        )}
        {channel.product_mappings.length > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full border" style={{ color: "var(--color-text-muted)", borderColor: "var(--color-border)" }}>
            {channel.product_mappings.length} product{channel.product_mappings.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div>
          <dt className="text-[var(--color-text-muted)]">Credit Term</dt>
          <dd style={{ color: "var(--color-text)" }}>{channel.credit_term_days} day{channel.credit_term_days !== 1 ? "s" : ""}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-muted)]">Delivery Frequency</dt>
          <dd style={{ color: "var(--color-text)" }}>{DELIVERY_FREQUENCY_LABEL[channel.delivery_frequency]}</dd>
        </div>
      </dl>
      {channel.product_mappings.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {channel.product_mappings.map((p) => (
            <span key={p.product_id} className="text-xs px-2 py-0.5 rounded-full border" style={{ color: "var(--color-text-muted)", borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
              {p.product_name}
            </span>
          ))}
        </div>
      )}
      <ContactsTable contacts={channel.contacts} />
    </div>
  );
}

export function SupplierViewModal({ isOpen, onClose, supplier }: SupplierViewModalProps) {
  if (!supplier) return null;

  const isAgency    = supplier.supplier_type === "AGENCY";
  const channels    = isAgency ? supplier.agency_channels : supplier.distributor_channels;
  const totalChannels = channels.length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Supplier Details" size="xl">
      <div className="space-y-6">

        {/* ── Summary ─────────────────────────────────────────────────────── */}
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Short Name</dt>
            <dd className="text-sm font-semibold mt-1" style={{ color: "var(--color-text)" }}>{supplier.short_name}</dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Type</dt>
            <dd className="mt-1">
              <Badge variant={SUPPLIER_TYPE_VARIANT[supplier.supplier_type]}>
                {SUPPLIER_TYPE_LABEL[supplier.supplier_type]}
              </Badge>
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Status</dt>
            <dd className="mt-1">
              {supplier.is_active
                ? <Badge variant="success">Active</Badge>
                : <Badge variant="danger">Inactive</Badge>
              }
            </dd>
          </div>

          <div className="col-span-2 sm:col-span-3">
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Legal Name</dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>{supplier.legal_name}</dd>
          </div>

          {supplier.registration_number && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Registration No.</dt>
              <dd className="text-sm mt-1 font-mono" style={{ color: "var(--color-text)" }}>{supplier.registration_number}</dd>
            </div>
          )}

          {supplier.created_at && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Created</dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>{supplier.created_at.slice(0, 10)}</dd>
            </div>
          )}

          {supplier.updated_at && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Last Updated</dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>{supplier.updated_at.slice(0, 10)}</dd>
            </div>
          )}
        </dl>

        {/* ── Channels ────────────────────────────────────────────────────── */}
        <div>
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>
            {isAgency ? "Agency Channels" : "Distribution Channels"} {totalChannels > 0 && `(${totalChannels})`}
          </h3>

          {totalChannels === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: "var(--color-text-muted)" }}>No channels recorded.</p>
          ) : (
            <div className="space-y-4">
              {isAgency
                ? supplier.agency_channels.map((ch, idx) => (
                    <div key={idx} className="rounded-lg border p-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
                      <AgencyChannelDetail channel={ch} />
                    </div>
                  ))
                : supplier.distributor_channels.map((ch, idx) => (
                    <div key={idx} className="rounded-lg border p-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
                      <DistributorChannelDetail channel={ch} />
                    </div>
                  ))
              }
            </div>
          )}
        </div>

        {/* ── Expiry Alert Configs ─────────────────────────────────────────── */}
        {supplier.expiry_alert_configs.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>
              Expiry Alert Configs ({supplier.expiry_alert_configs.length})
            </h3>
            <div className="rounded-lg overflow-auto border" style={{ borderColor: "var(--color-border)" }}>
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr style={{ background: "var(--color-surface-2)" }}>
                    {["Days Before Expiry", "Brand"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {supplier.expiry_alert_configs.map((cfg, idx) => (
                    <tr key={idx} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text)" }}>{cfg.days_before_expiry} days</td>
                      <td className="px-3 py-2" style={{ color: "var(--color-text-muted)" }}>{cfg.brand_name ?? "All brands"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
}
