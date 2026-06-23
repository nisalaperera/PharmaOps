"use client";

import { useFieldArray } from "react-hook-form";
import type { Control, FieldErrors, UseFormRegister, UseFormWatch } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input }  from "@/components/ui/Input";
import { Badge }  from "@/components/ui/Badge";
import { PROMOTION_TYPE_OPTIONS } from "@/lib/constants";

type ChannelType = "agency_channels" | "distributor_channels";

interface PromotionsFormSectionProps {
  channelType: ChannelType;
  channelIndex: number;
  control:  Control<any>;
  register: UseFormRegister<any>;
  watch:    UseFormWatch<any>;
  errors:   FieldErrors<any>;
}

const EMPTY_PROMOTION = {
  name:             "",
  promotion_type:   "PERCENTAGE" as const,
  discount_percent: undefined as number | undefined,
  buy_quantity:     undefined as number | undefined,
  free_quantity:    undefined as number | undefined,
  is_default:       true,
  valid_from:       "",
  valid_to:         "",
  is_active:        true,
};

export function PromotionsFormSection({
  channelType,
  channelIndex,
  control,
  register,
  watch,
  errors,
}: PromotionsFormSectionProps) {
  const basePath = `${channelType}.${channelIndex}.promotions` as const;

  const { fields, append, remove } = useFieldArray({
    control,
    name: basePath as any,
    keyName: "rhfKey",
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
          Promotions ({fields.length})
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          leftIcon={<Plus className="w-3 h-3" />}
          onClick={() => append({ ...EMPTY_PROMOTION })}
        >
          Add Promotion
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="text-xs py-2 text-center" style={{ color: "var(--color-text-muted)" }}>
          No promotions. Add one to offer discounts or bonus quantities on this channel.
        </p>
      )}

      {fields.map((field, index) => {
        const promoPath = `${basePath}.${index}` as any;
        const promoType = watch(`${promoPath}.promotion_type`);
        const isDefault = watch(`${promoPath}.is_default`);
        const promoErrors = (errors as any)?.[channelType]?.[channelIndex]?.promotions?.[index];

        return (
          <div
            key={(field as Record<string, string>).rhfKey}
            className="rounded-lg border p-3 space-y-3"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                  Promotion {index + 1}
                </span>
                {isDefault && <Badge variant="info">Default</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    {...register(`${promoPath}.is_active`)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                  />
                  <span style={{ color: "var(--color-text-muted)" }}>Active</span>
                </label>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="p-1 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Input
                label="Name"
                placeholder="e.g. 10% Off"
                required
                {...register(`${promoPath}.name`)}
                error={promoErrors?.name?.message}
              />

              <div>
                <label className="form-label">Type</label>
                <select {...register(`${promoPath}.promotion_type`)} className="form-select w-full">
                  {PROMOTION_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {promoType === "PERCENTAGE" && (
                <Input
                  label="Discount %"
                  type="number"
                  step="0.1"
                  placeholder="e.g. 10"
                  {...register(`${promoPath}.discount_percent`)}
                  error={promoErrors?.discount_percent?.message}
                />
              )}

              {promoType === "BONUS_QUANTITY" && (
                <>
                  <Input
                    label="Buy Qty"
                    type="number"
                    placeholder="e.g. 10"
                    {...register(`${promoPath}.buy_quantity`)}
                    error={promoErrors?.buy_quantity?.message}
                  />
                  <Input
                    label="Free Qty"
                    type="number"
                    placeholder="e.g. 2"
                    {...register(`${promoPath}.free_quantity`)}
                    error={promoErrors?.free_quantity?.message}
                  />
                </>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="flex items-center gap-2 pt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    {...register(`${promoPath}.is_default`)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-4 h-4"
                  />
                  <span className="text-xs font-medium" style={{ color: "var(--color-text)" }}>
                    Default (always applies)
                  </span>
                </label>
              </div>

              {!isDefault && (
                <>
                  <Input
                    label="Valid From"
                    type="date"
                    {...register(`${promoPath}.valid_from`)}
                  />
                  <Input
                    label="Valid To"
                    type="date"
                    {...register(`${promoPath}.valid_to`)}
                  />
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
