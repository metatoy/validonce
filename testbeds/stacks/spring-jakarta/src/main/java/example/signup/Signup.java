// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package example.signup;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;

@CompanyForPro
public class Signup {
    @NotNull
    @Pattern(regexp = "free|pro")
    private String plan;
    private String company;
    @NotEmpty
    private String email;
    @NotNull
    private LocalDate start;
    private LocalDate end;
    @NotNull
    @Min(1)
    private Integer quantity;

    @JsonIgnore
    @AssertTrue(message = "end must be on or after start")
    public boolean isEndAfterStart() {
        return end == null || start == null || !end.isBefore(start);
    }

    public String getPlan() { return plan; }
    public void setPlan(String plan) { this.plan = plan; }
    public String getCompany() { return company; }
    public void setCompany(String company) { this.company = company; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public LocalDate getStart() { return start; }
    public void setStart(LocalDate start) { this.start = start; }
    public LocalDate getEnd() { return end; }
    public void setEnd(LocalDate end) { this.end = end; }
    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }
}
