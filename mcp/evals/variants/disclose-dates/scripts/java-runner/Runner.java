// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC
//
// validonce-migrate runner for Jakarta Bean Validation (Hibernate Validator). Single file,
// launched from source (JDK 21):
//
//   java -cp "libs/*:classes" Runner.java <fully.qualified.ModelClass> <inputs.jsonl> <out.jsonl>
//
// Input: one wire-JSON object per line. Output, one line per input:
//   {"accept": bool, "paths": ["top-level wire field names with errors"], "error"?: "..."}
//
// Each line is bound to the user's class with Jackson (so @JsonProperty / naming strategies give the
// wire names, as in Spring; the Jackson modules on the classpath are registered, so LocalDate binds), then validated with the default Validator. A violation's first path node
// is mapped from the Java property to its wire name; a class-level violation with no property node
// is "__root__". A line that does not bind is {"error": "parse: ..."} (never a rejection). A
// ConstraintValidator that throws is {"error": ...}. Offline: reads only the inputs file.
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.introspect.BeanPropertyDefinition;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.io.BufferedWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class Runner {
  public static void main(String[] a) throws Exception {
    if (a.length != 3) {
      System.err.println("usage: java -cp \"libs/*:classes\" Runner.java <ModelClass> <inputs.jsonl> <out.jsonl>");
      System.exit(2);
    }
    Class<?> model;
    try {
      model = Class.forName(a[0]);
    } catch (ClassNotFoundException e) {
      System.err.println("validonce runner: cannot load " + a[0] + " (compile the model into classes/ first)");
      System.exit(3);
      return;
    }
    ObjectMapper mapper = new ObjectMapper().findAndRegisterModules().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    Validator validator;
    try {
      validator = Validation.buildDefaultValidatorFactory().getValidator();
    } catch (Throwable t) {
      System.err.println("validonce runner: cannot start the Validator: " + t);
      System.exit(3);
      return;
    }
    // Java property name -> wire name (Jackson's view, so @JsonProperty and naming strategies apply).
    Map<String, String> wire = new HashMap<>();
    JavaType jt = mapper.constructType(model);
    for (BeanPropertyDefinition p : mapper.getDeserializationConfig().introspect(jt).findProperties())
      wire.put(p.getInternalName(), p.getName());
    System.err.println("validonce-runner: java-runner java=" + System.getProperty("java.version")
        + " validator=" + validator.getClass().getName().replaceAll("\\$.*", "") + " model=" + a[0]
        + " (offline, reads only the inputs file)");

    try (BufferedWriter w = Files.newBufferedWriter(Path.of(a[2]), StandardCharsets.UTF_8)) {
      for (String line : Files.readAllLines(Path.of(a[1]), StandardCharsets.UTF_8)) {
        if (line.isBlank()) continue;
        w.write(run(mapper, validator, model, wire, line));
        w.write('\n');
      }
    }
  }

  static String run(ObjectMapper mapper, Validator validator, Class<?> model, Map<String, String> wire, String line) {
    Object o;
    try {
      o = mapper.readValue(line, model);
    } catch (Exception e) {
      return "{\"accept\":false,\"paths\":[],\"error\":" + quote("parse: " + oneLine(e.getMessage())) + "}";
    }
    try {
      Set<ConstraintViolation<Object>> vs = validator.validate(o);
      Set<String> paths = new LinkedHashSet<>();
      for (ConstraintViolation<Object> v : vs) {
        String first = null;
        for (var n : v.getPropertyPath()) {
          first = n.getName();
          break;
        }
        paths.add(first == null ? "__root__" : wire.getOrDefault(first, first));
      }
      List<String> q = new ArrayList<>();
      for (String p : paths) q.add(quote(p));
      return "{\"accept\":" + vs.isEmpty() + ",\"paths\":[" + String.join(",", q) + "]}";
    } catch (Exception e) {
      return "{\"accept\":false,\"paths\":[],\"error\":" + quote(e.getClass().getSimpleName() + ": " + oneLine(e.getMessage())) + "}";
    }
  }

  static String oneLine(String s) {
    return s == null ? "" : s.replaceAll("\\s+", " ").trim();
  }

  static String quote(String s) {
    StringBuilder b = new StringBuilder("\"");
    for (char c : s.toCharArray()) {
      if (c == '"' || c == '\\') b.append('\\').append(c);
      else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
      else b.append(c);
    }
    return b.append('"').toString();
  }
}
