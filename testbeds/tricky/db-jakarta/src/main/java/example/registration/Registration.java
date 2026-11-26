// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package example.registration;

import jakarta.validation.constraints.NotEmpty;

@UniqueEmail
public class Registration {
    @NotEmpty
    private String email;
    @NotEmpty
    private String displayName;

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
}
