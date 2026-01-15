import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  contractor: string;
  headcount: number;
  workDescription: string;
  onChange: (contractor: string, headcount: number, workDescription: string) => void;
  onRemove: () => void;
  disabled?: boolean;
  index: number;
}

export function WorkActivityRowInput({ contractor, headcount, workDescription, onChange, onRemove, disabled, index }: WorkActivityRowProps) {
  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/50 border border-border">
      <div className="flex items-center gap-2">
        <Input
          value={contractor}
          onChange={(e) => onChange(e.target.value, headcount, workDescription)}
          placeholder="Contractor/Trade (or GC)"
          disabled={disabled}
          className="flex-1"
          data-testid={`input-activity-contractor-${index}`}
        />
        <Input
          type="number"
          value={headcount || ""}
          onChange={(e) => onChange(contractor, parseInt(e.target.value) || 0, workDescription)}
          placeholder="Headcount"
          disabled={disabled}
          className="w-24"
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
        onChange={(e) => onChange(contractor, headcount, e.target.value)}
        placeholder="Work description / activity performed"
        disabled={disabled}
        rows={3}
        className="resize-none"
        data-testid={`input-activity-work-${index}`}
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
