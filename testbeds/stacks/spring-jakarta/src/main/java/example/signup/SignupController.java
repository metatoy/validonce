// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package example.signup;

import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SignupController {
    @PostMapping("/signups")
    public Map<String, Boolean> create(@Valid @RequestBody Signup body) {
        return Map.of("ok", true);
    }
}
