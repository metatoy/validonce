// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package main

import (
	"github.com/danielgtaylor/huma/v2"

	validonce "github.com/metatoy/validonce/go"
	"github.com/metatoy/validonce/go/humaonce"
)

// Contact is the playground contract: the same fields and rules in every example backend.
type Contact struct {
	Email         *string `json:"email,omitempty" format:"email" nullable:"true"`
	Phone         *string `json:"phone,omitempty" pattern:"^\\+?[0-9 ()-]{7,20}$" nullable:"true"`
	Street        *string `json:"street,omitempty" nullable:"true"`
	City          *string `json:"city,omitempty" nullable:"true"`
	PostalCode    *string `json:"postalCode,omitempty" nullable:"true"`
	Country       string  `json:"country" enum:"US,CA,GB,other"`
	AvailableFrom *string `json:"availableFrom,omitempty" format:"date" nullable:"true"`
	AvailableTo   *string `json:"availableTo,omitempty" format:"date" nullable:"true"`
}

// playground:begin
var contactRules = validonce.MustBuild[Contact](
	validonce.AtLeastOneOf([]string{"email", "phone"},
		validonce.Key("rules.contact_email_or_phone"), validonce.ID("Contact.at_least_one_of.email")),
	validonce.AllOrNone([]string{"street", "city", "postalCode"},
		validonce.Key("rules.address_all_or_none"), validonce.ID("Contact.all_or_none.street")),
	validonce.When(validonce.Eq("country", "US")).Require("postalCode",
		validonce.Key("rules.postal_code_required_us"), validonce.ID("Contact.required_when.postalCode")),
	validonce.Cmp("availableTo").Ge(validonce.Ref("availableFrom"),
		validonce.Key("rules.available_to_after_from"), validonce.ID("Contact.compare.availableTo")),
)
// playground:end

// TransformSchema publishes the rules as x-validonce on the Contact component schema.
func (Contact) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return humaonce.Transform(contactRules, s)
}
