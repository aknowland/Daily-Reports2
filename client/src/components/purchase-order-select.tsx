import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PurchaseOrder } from "@shared/schema";

interface PurchaseOrderSelectProps {
  value: string;
  onValueChange: (value: string, poNumber?: string) => void;
  companyId: string;
  clientId: string;
  placeholder?: string;
  disabled?: boolean;
  "data-testid"?: string;
}

type POFormData = {
  poNumber: string;
  totalAmount: string;
  description: string;
  issueDate: string;
  expirationDate: string;
};

const emptyFormData: POFormData = {
  poNumber: "",
  totalAmount: "",
  description: "",
  issueDate: "",
  expirationDate: "",
};

export function PurchaseOrderSelect({
  value,
  onValueChange,
  companyId,
  clientId,
  placeholder = "Select a purchase order",
  disabled = false,
  "data-testid": testId,
}: PurchaseOrderSelectProps) {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState<POFormData>(emptyFormData);

  const { data: purchaseOrders = [] } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders", companyId],
    queryFn: async () => {
      const response = await fetch("/api/purchase-orders", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch purchase orders");
      return response.json();
    },
    enabled: !!companyId,
  });

  const filteredPOs = clientId 
    ? purchaseOrders.filter(po => po.clientId === clientId)
    : purchaseOrders;

  const createMutation = useMutation({
    mutationFn: async (data: POFormData) => {
      const response = await apiRequest("POST", "/api/purchase-orders", {
        poNumber: data.poNumber,
        clientId: clientId,
        totalAmount: data.totalAmount || null,
        description: data.description || null,
        status: "active",
        issueDate: data.issueDate ? new Date(data.issueDate) : null,
        expirationDate: data.expirationDate ? new Date(data.expirationDate) : null,
      });
      return response.json();
    },
    onSuccess: (newPO: PurchaseOrder) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", companyId] });
      toast({ title: "Purchase order created" });
      onValueChange(newPO.id, newPO.poNumber);
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create purchase order",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCloseDialog = () => {
    setIsCreateDialogOpen(false);
    setFormData(emptyFormData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.poNumber.trim()) {
      toast({
        title: "Validation error",
        description: "PO number is required",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(formData);
  };

  const handleSelectChange = (selectedValue: string) => {
    if (selectedValue === "__create_new__") {
      setIsCreateDialogOpen(true);
    } else if (selectedValue === "__clear__") {
      onValueChange("", "");
    } else {
      const po = filteredPOs.find((p) => p.id === selectedValue);
      onValueChange(selectedValue, po?.poNumber);
    }
  };

  return (
    <>
      <Select value={value} onValueChange={handleSelectChange} disabled={disabled}>
        <SelectTrigger data-testid={testId}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {value && (
            <SelectItem value="__clear__" className="text-muted-foreground" data-testid="select-item-po-clear">
              Clear selection
            </SelectItem>
          )}
          <SelectItem value="__create_new__" className="font-medium" data-testid="select-item-po-create-new">
            + Create new purchase order
          </SelectItem>
          {filteredPOs.map((po) => (
            <SelectItem key={po.id} value={po.id} data-testid={`select-item-po-${po.id}`}>
              {po.poNumber} - ${parseFloat(po.totalAmount || "0").toLocaleString()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Purchase Order</DialogTitle>
            <DialogDescription>
              Add a new purchase order for this client.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="create-poNumber">
                  PO Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="create-poNumber"
                  value={formData.poNumber}
                  onChange={(e) => setFormData({ ...formData, poNumber: e.target.value })}
                  placeholder="Enter PO number"
                  data-testid="input-new-po-number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-totalAmount">Total Amount</Label>
                <Input
                  id="create-totalAmount"
                  type="number"
                  step="0.01"
                  value={formData.totalAmount}
                  onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-new-po-amount"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="create-issueDate">Issue Date</Label>
                  <Input
                    id="create-issueDate"
                    type="date"
                    value={formData.issueDate}
                    onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                    data-testid="input-new-po-issue-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-expirationDate">Expiration Date</Label>
                  <Input
                    id="create-expirationDate"
                    type="date"
                    value={formData.expirationDate}
                    onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                    data-testid="input-new-po-expiration-date"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-description">Description</Label>
                <Textarea
                  id="create-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description or notes..."
                  rows={2}
                  data-testid="input-new-po-description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
                data-testid="button-cancel-new-po"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                data-testid="button-save-new-po"
              >
                {createMutation.isPending ? "Creating..." : "Create PO"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
