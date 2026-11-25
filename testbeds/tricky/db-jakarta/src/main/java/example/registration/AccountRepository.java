// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package example.registration;

public interface AccountRepository {
    boolean existsByEmailAndDisplayNameNot(String email, String displayName);
}
