// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// java -cp "libs/*:classes" ExportRules.java <fully.qualified.Model>: prints the rules of the model's @ValidonceRules as JSON.
import com.fasterxml.jackson.databind.ObjectMapper;
import com.metatoy.validonce.RuleDefinition;
import com.metatoy.validonce.spring.ValidonceRules;
import java.lang.reflect.Constructor;

public class ExportRules {
    public static void main(String[] a) throws Exception {
        ValidonceRules ann = Class.forName(a[0]).getAnnotation(ValidonceRules.class);
        if (ann == null) {
            System.out.println("{\"error\": \"the class has no @ValidonceRules\"}");
            return;
        }
        Constructor<?> k = ann.value().getDeclaredConstructor();
        k.setAccessible(true);
        RuleDefinition<?> d = (RuleDefinition<?>) k.newInstance();
        System.out.println(d.rules(new ObjectMapper().findAndRegisterModules()).toJson());
    }
}
