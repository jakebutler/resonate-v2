import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";

describe("field and input-group helpers", () => {
  it("renders field primitives and deduplicates repeated errors", () => {
    render(
      <FieldSet>
        <FieldLegend variant="label">Publishing Settings</FieldLegend>
        <FieldGroup>
          <Field orientation="responsive" data-invalid="true">
            <FieldLabel htmlFor="slug">
              <FieldTitle>Slug</FieldTitle>
            </FieldLabel>
            <FieldContent>
              <input id="slug" defaultValue="editorial-systems" />
              <FieldDescription>Used in the published URL.</FieldDescription>
              <FieldError
                errors={[
                  { message: "Slug is required." },
                  { message: "Slug is required." },
                  { message: "Slug must be unique." },
                ]}
              />
            </FieldContent>
          </Field>
          <FieldSeparator>Or</FieldSeparator>
        </FieldGroup>
      </FieldSet>
    );

    expect(screen.getByText("Publishing Settings")).toBeInTheDocument();
    expect(screen.getByText("Slug")).toBeInTheDocument();
    expect(screen.getByText("Used in the published URL.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Slug is required.");
    expect(screen.getByRole("alert")).toHaveTextContent("Slug must be unique.");
    expect(screen.getByText("Or")).toHaveAttribute("data-slot", "field-separator-content");
  });

  it("renders input groups and focuses the control when an addon is clicked", () => {
    render(
      <>
        <InputGroup>
          <InputGroupAddon>https://</InputGroupAddon>
          <InputGroupInput aria-label="Site URL" defaultValue="corvolabs.com" />
          <InputGroupButton>Visit</InputGroupButton>
          <InputGroupText>Status</InputGroupText>
        </InputGroup>
        <InputGroup>
          <InputGroupAddon align="block-end">Notes</InputGroupAddon>
          <InputGroupTextarea aria-label="Notes" defaultValue="Draft notes" />
        </InputGroup>
      </>
    );

    fireEvent.click(screen.getByText("https://"));
    expect(screen.getByLabelText("Site URL")).toHaveFocus();
    expect(screen.getByText("Visit")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toHaveValue("Draft notes");
  });
});
