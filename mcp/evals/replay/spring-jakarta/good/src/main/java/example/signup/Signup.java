// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package example.signup;

import com.metatoy.validonce.spring.ValidonceRules;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;

@ValidonceRules(SignupRules.class)
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
    private Integer quantity;

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
