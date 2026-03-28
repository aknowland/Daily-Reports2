import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

interface TradeRowProps {
  trade: string;
  headcount: number;
  onChange: (trade: string, headcount: number) => void;
  onRemove: () => void;
  disabled?: boolean;
  index: number;
}

export function TradeRowInput({ trade, headcount, onChange, onRemove, disabled, index }: TradeRowProps) {
  return (
    <div className="flex items-center gap-2 p-3 bg-muted/50 border border-border">
      <Input
        value={trade}
        onChange={(e) => onChange(e.target.value, headcount)}
        placeholder="Trade name"
        disabled={disabled}
        className="flex-1"
        data-testid={`input-trade-name-${index}`}
      />
      <Input
        type="number"
        value={headcount || ""}
        onChange={(e) => onChange(trade, parseInt(e.target.value) || 0)}
        placeholder="Count"
        disabled={disabled}
        className="w-20"
        min={0}
        data-testid={`input-trade-headcount-${index}`}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
        data-testid={`button-remove-trade-${index}`}
      >
        <Trash2 className="w-4 h-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

interface ManpowerRowProps {
  description: string;
  count: number;
  onChange: (description: string, count: number) => void;
  onRemove: () => void;
  disabled?: boolean;
  index: number;
}

export function ManpowerRowInput({ description, count, onChange, onRemove, disabled, index }: ManpowerRowProps) {
  return (
    <div className="flex items-center gap-2 p-3 bg-muted/50 border border-border">
      <Input
        value={description}
        onChange={(e) => onChange(e.target.value, count)}
        placeholder="Description"
        disabled={disabled}
        className="flex-1"
        data-testid={`input-manpower-desc-${index}`}
      />
      <Input
        type="number"
        value={count || ""}
        onChange={(e) => onChange(description, parseInt(e.target.value) || 0)}
        placeholder="Count"
        disabled={disabled}
        className="w-20"
        min={0}
        data-testid={`input-manpower-count-${index}`}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
        data-testid={`button-remove-manpower-${index}`}
      >
        <Trash2 className="w-4 h-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

interface VisitorRowProps {
  name: string;
  company: string;
  notes?: string;
  onChange: (name: string, company: string, notes?: string) => void;
  onRemove: () => void;
  disabled?: boolean;
  index: number;
}

export function VisitorRowInput({ name, company, notes, onChange, onRemove, disabled, index }: VisitorRowProps) {
  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/50 border border-border">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => onChange(e.target.value, company, notes)}
          placeholder="Visitor name"
          disabled={disabled}
          className="flex-1"
          data-testid={`input-visitor-name-${index}`}
        />
        <Input
          value={company}
          onChange={(e) => onChange(name, e.target.value, notes)}
          placeholder="Company"
          disabled={disabled}
          className="flex-1"
          data-testid={`input-visitor-company-${index}`}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={disabled}
          data-testid={`button-remove-visitor-${index}`}
        >
          <Trash2 className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>
      <Input
        value={notes || ""}
        onChange={(e) => onChange(name, company, e.target.value)}
        placeholder="Notes (optional)"
        disabled={disabled}
        data-testid={`input-visitor-notes-${index}`}
      />
    </div>
  );
}

interface WorkActivityRowProps {
  trade?: string;
  contractor: string;
  headcount: number;
  workDescription: string;
  onChange: (trade: string, contractor: string, headcount: number, workDescription: string) => void;
  onRemove: () => void;
  disabled?: boolean;
  index: number;
}

export function WorkActivityRowInput({ trade, contractor, headcount, workDescription, onChange, onRemove, disabled, index }: WorkActivityRowProps) {
  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/50 border border-border">
      <div className="flex items-center gap-2">
        <Input
          value={trade || ""}
          onChange={(e) => onChange(e.target.value, contractor, headcount, workDescription)}
          placeholder="Trade (e.g., Iron Workers)"
          disabled={disabled}
          className="flex-1"
          data-testid={`input-activity-trade-${index}`}
        />
        <Input
          value={contractor}
          onChange={(e) => onChange(trade || "", e.target.value, headcount, workDescription)}
          placeholder="Contractor / Subcontractor"
          disabled={disabled}
          className="flex-1"
          data-testid={`input-activity-contractor-${index}`}
        />
        <Input
          type="number"
          value={headcount || ""}
          onChange={(e) => onChange(trade || "", contractor, parseInt(e.target.value) || 0, workDescription)}
          placeholder="Count"
          disabled={disabled}
          className="w-20"
          min={0}
          data-testid={`input-activity-headcount-${index}`}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={disabled}
          data-testid={`button-remove-activity-${index}`}
        >
          <Trash2 className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>
      <Textarea
        value={workDescription}
        onChange={(e) => onChange(trade || "", contractor, headcount, e.target.value)}
        placeholder="Work description / activity performed"
        disabled={disabled}
        rows={2}
        className="resize-none"
        data-testid={`input-activity-work-${index}`}
      />
    </div>
  );
}

const EQUIPMENT_STATUS_OPTIONS = ["ACTIVE", "STANDBY", "IDLE", "OFFSITE"];
const MATERIAL_STATUS_OPTIONS = ["DELIVERED", "DELAYED", "ORDERED", "PENDING"];

interface EquipmentRowProps {
  equipment: string;
  hours?: string;
  status?: string;
  usage?: string;
  onChange: (equipment: string, hours: string, status: string, usage: string) => void;
  onRemove: () => void;
  disabled?: boolean;
  index: number;
}

export function EquipmentRowInput({ equipment, hours, status, usage, onChange, onRemove, disabled, index }: EquipmentRowProps) {
  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/50 border border-border">
      <div className="flex items-center gap-2">
        <Input
          value={equipment}
          onChange={(e) => onChange(e.target.value, hours || "", status || "", usage || "")}
          placeholder="Equipment name/type"
          disabled={disabled}
          className="flex-1"
          data-testid={`input-equipment-name-${index}`}
        />
        <Input
          value={hours || ""}
          onChange={(e) => onChange(equipment, e.target.value, status || "", usage || "")}
          placeholder="Hours"
          disabled={disabled}
          className="w-20"
          data-testid={`input-equipment-hours-${index}`}
        />
        <Select
          value={status || ""}
          onValueChange={(v) => onChange(equipment, hours || "", v, usage || "")}
          disabled={disabled}
        >
          <SelectTrigger className="w-28" data-testid={`select-equipment-status-${index}`}>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {EQUIPMENT_STATUS_OPTIONS.map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={disabled}
          data-testid={`button-remove-equipment-${index}`}
        >
          <Trash2 className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>
      <Input
        value={usage || ""}
        onChange={(e) => onChange(equipment, hours || "", status || "", e.target.value)}
        placeholder="Usage description"
        disabled={disabled}
        data-testid={`input-equipment-usage-${index}`}
      />
    </div>
  );
}

interface MaterialRowProps {
  material: string;
  quantity?: string;
  status?: string;
  supplierNotes?: string;
  onChange: (material: string, quantity: string, status: string, supplierNotes: string) => void;
  onRemove: () => void;
  disabled?: boolean;
  index: number;
}

export function MaterialRowInput({ material, quantity, status, supplierNotes, onChange, onRemove, disabled, index }: MaterialRowProps) {
  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/50 border border-border">
      <div className="flex items-center gap-2">
        <Input
          value={material}
          onChange={(e) => onChange(e.target.value, quantity || "", status || "", supplierNotes || "")}
          placeholder="Material name"
          disabled={disabled}
          className="flex-1"
          data-testid={`input-material-name-${index}`}
        />
        <Input
          value={quantity || ""}
          onChange={(e) => onChange(material, e.target.value, status || "", supplierNotes || "")}
          placeholder="Qty"
          disabled={disabled}
          className="w-24"
          data-testid={`input-material-qty-${index}`}
        />
        <Select
          value={status || ""}
          onValueChange={(v) => onChange(material, quantity || "", v, supplierNotes || "")}
          disabled={disabled}
        >
          <SelectTrigger className="w-28" data-testid={`select-material-status-${index}`}>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {MATERIAL_STATUS_OPTIONS.map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={disabled}
          data-testid={`button-remove-material-${index}`}
        >
          <Trash2 className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>
      <Input
        value={supplierNotes || ""}
        onChange={(e) => onChange(material, quantity || "", status || "", e.target.value)}
        placeholder="Supplier / Notes"
        disabled={disabled}
        data-testid={`input-material-supplier-${index}`}
      />
    </div>
  );
}

interface AddRowButtonProps {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  testId?: string;
}

export function AddRowButton({ onClick, label, disabled, testId }: AddRowButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className="w-full border-dashed"
      data-testid={testId}
    >
      <Plus className="w-4 h-4 mr-2" />
      {label}
    </Button>
  );
}
