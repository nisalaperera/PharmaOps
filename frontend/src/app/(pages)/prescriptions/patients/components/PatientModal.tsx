"use client";

import { useEffect, useState, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Modal }    from "@/components/ui/Modal";
import { Button }   from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { showToast }     from "@/lib/toast";
import { apiPost, apiPatch, apiGet } from "@/lib/api-client";
import { debounce }      from "@/lib/utils";
import { RELATIONSHIP_OPTIONS } from "@/lib/constants";
import { patientCreateSchema, type PatientCreateValues } from "../schemas";
import type { Patient, Customer, PaginatedResponse } from "@/types";

interface PatientModalProps {
  patient: Patient | null;
  isOpen:  boolean;
  onClose: () => void;
}

export function PatientModal({ patient, isOpen, onClose }: PatientModalProps) {
  const isEdit      = !!patient;
  const queryClient = useQueryClient();

  const [customerSearch, setCustomerSearch] = useState("");
  const [customerQuery, setCustomerQuery]   = useState("");
  const [dropdownOpen, setDropdownOpen]     = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<PatientCreateValues>({
    resolver: zodResolver(patientCreateSchema),
    defaultValues: { relationship: "SELF" },
  });

  const debouncedSearch = useCallback(
    debounce((v: unknown) => setCustomerQuery(v as string), 300),
    []
  );

  const { data: customersData } = useQuery({
    queryKey: ["customers-search", customerQuery],
    queryFn:  () => apiGet<PaginatedResponse<Customer>>("/customers", { search: customerQuery, is_active: true, page_size: 20 }),
    enabled:  dropdownOpen || !!customerQuery,
  });

  useEffect(() => {
    if (isOpen) {
      if (patient) {
        reset({
          customer_id:   patient.customer_id,
          name:          patient.name,
          relationship:  patient.relationship,
          date_of_birth: patient.date_of_birth ?? "",
        });
        setCustomerSearch(patient.customer_name);
      } else {
        reset({ relationship: "SELF" });
        setCustomerSearch("");
      }
    }
  }, [isOpen, patient, reset]);

  function selectCustomer(c: Customer) {
    setCustomerSearch(c.full_name);
    setValue("customer_id", c.id, { shouldValidate: true });
    setDropdownOpen(false);
  }

  const mutation = useMutation({
    mutationFn: (data: PatientCreateValues) => {
      const payload = { ...data, date_of_birth: data.date_of_birth || null };
      return isEdit
        ? apiPatch<Patient>(`/patients/${patient!.id}`, payload)
        : apiPost<Patient>("/patients", payload);
    },
    onSuccess: () => {
      showToast("success", isEdit ? "Patient updated" : "Patient created", `Patient profile has been ${isEdit ? "updated" : "created"}.`);
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      onClose();
    },
    onError: (err: Error) => {
      showToast("error", "Save failed", err.message);
    },
  });

  const customers = customersData?.data ?? [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? "Edit Patient" : "New Patient Profile"} size="sm">
      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">

        {/* Customer search */}
        <div>
          <label className="form-label">Customer <span className="text-danger-500 ml-1">*</span></label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--color-text-muted)" }}>
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              className="form-input pl-9"
              placeholder="Search customer…"
              value={customerSearch}
              disabled={isEdit}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                debouncedSearch(e.target.value);
                setDropdownOpen(true);
                if (!e.target.value) { setValue("customer_id", ""); }
              }}
              onFocus={() => setDropdownOpen(true)}
              onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
            />
            {dropdownOpen && customers.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-xl shadow-lg border overflow-hidden"
                   style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                {customers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--color-surface-2)] transition-colors"
                    style={{ color: "var(--color-text)" }}
                    onMouseDown={() => selectCustomer(c)}
                  >
                    <p className="font-medium">{c.full_name}</p>
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{c.phone}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Hidden field for validation */}
          <Controller
            name="customer_id"
            control={control}
            render={({ field }) => <input type="hidden" {...field} />}
          />
          {errors.customer_id && <p className="form-error">{errors.customer_id.message}</p>}
        </div>

        <Input
          label="Patient Name"
          required
          placeholder="Full name"
          error={errors.name?.message}
          {...register("name")}
        />

        <Select
          label="Relationship to Customer"
          required
          options={RELATIONSHIP_OPTIONS}
          error={errors.relationship?.message}
          {...register("relationship")}
        />

        <Input
          label="Date of Birth"
          type="date"
          error={errors.date_of_birth?.message}
          {...register("date_of_birth")}
        />

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>
            {isEdit ? "Save Changes" : "Create Patient"}
          </Button>
        </div>

      </form>
    </Modal>
  );
}
