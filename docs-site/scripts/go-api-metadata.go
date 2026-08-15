package main

import (
  "encoding/json"
  "flag"
  "go/ast"
  "go/format"
  "go/parser"
  "go/token"
  "os"
  "path/filepath"
  "strings"
)

type Item struct { Name string `json:"name"`; Type string `json:"type"`; Summary string `json:"summary"` }
type API struct { Kind string `json:"kind"`; Symbol string `json:"symbol"`; Signature string `json:"signature"`; Summary string `json:"summary"`; File string `json:"file"`; Parameters []Item `json:"parameters,omitempty"`; Returns string `json:"returns,omitempty"`; Fields []Item `json:"fields,omitempty"`; Methods []Item `json:"methods,omitempty"` }
type Output struct { APIs []API `json:"apis"` }

func isExported(name string) bool { return len(name) > 0 && name[0] >= 'A' && name[0] <= 'Z' }
func printNode(n ast.Node, fset *token.FileSet) string { var b strings.Builder; _ = format.Node(&b, fset, n); return strings.TrimSpace(b.String()) }
func comment(c *ast.CommentGroup) string { if c == nil { return "" }; return strings.TrimSpace(c.Text()) }
func results(list *ast.FieldList, fset *token.FileSet) string {
  if list == nil || len(list.List) == 0 { return "" }
  parts := []string{}
  for _, field := range list.List {
    typ := printNode(field.Type, fset)
    if len(field.Names) == 0 { parts = append(parts, typ); continue }
    for _, name := range field.Names { parts = append(parts, name.Name+" "+typ) }
  }
  if len(parts) == 1 { return parts[0] }
  return "(" + strings.Join(parts, ", ") + ")"
}

func main() {
  dir := flag.String("dir", "go", "package directory")
  out := flag.String("out", "go-api-metadata.json", "output")
  flag.Parse()
  fset := token.NewFileSet()
  packages, err := parser.ParseDir(fset, *dir, func(info os.FileInfo) bool { return !strings.HasSuffix(info.Name(), "_test.go") }, parser.ParseComments)
  if err != nil { panic(err) }
  result := Output{}
  for _, pkg := range packages {
    for filename, file := range pkg.Files {
      short := filepath.Base(filename)
      for _, decl := range file.Decls {
        switch d := decl.(type) {
        case *ast.FuncDecl:
          if !isExported(d.Name.Name) || d.Recv != nil { continue }
          api := API{Kind: "functions", Symbol: d.Name.Name, Summary: comment(d.Doc), File: short}
          if api.Summary == "" { api.Summary = comment(file.Doc) }
          api.Signature = "func " + d.Name.Name + printNode(d.Type, fset)[4:]
          for _, p := range d.Type.Params.List { for _, n := range p.Names { api.Parameters = append(api.Parameters, Item{Name: n.Name, Type: printNode(p.Type, fset)}) } }
          api.Returns = results(d.Type.Results, fset)
          result.APIs = append(result.APIs, api)
        case *ast.GenDecl:
          for _, spec := range d.Specs {
            switch s := spec.(type) {
            case *ast.TypeSpec:
              if !isExported(s.Name.Name) { continue }
              api := API{Kind: "types", Symbol: s.Name.Name, Signature: printNode(s, fset), Summary: comment(s.Doc), File: short}
              if api.Summary == "" { api.Summary = comment(d.Doc) }
              if st, ok := s.Type.(*ast.StructType); ok { for _, f := range st.Fields.List { for _, n := range f.Names { if isExported(n.Name) { api.Fields = append(api.Fields, Item{Name: n.Name, Type: printNode(f.Type, fset), Summary: comment(f.Doc)}) } } } }
              result.APIs = append(result.APIs, api)
            case *ast.ValueSpec:
              for i, n := range s.Names { if !isExported(n.Name) { continue }; value := ""; if i < len(s.Values) { value = printNode(s.Values[i], fset) }; text := comment(s.Doc); if text == "" { text = comment(d.Doc) }; result.APIs = append(result.APIs, API{Kind: "constants", Symbol: n.Name, Signature: "const " + n.Name + " = " + value, Summary: text, File: short}) }
            }
          }
        }
      }
    }
  }
  for _, pkg := range packages { for _, file := range pkg.Files { for _, decl := range file.Decls { if d, ok := decl.(*ast.FuncDecl); ok && d.Recv != nil && isExported(d.Name.Name) { receiver := printNode(d.Recv.List[0].Type, fset); receiver = strings.TrimPrefix(receiver, "*"); signature := "func " + d.Name.Name + printNode(d.Type, fset)[4:]; for i := range result.APIs { if result.APIs[i].Kind == "types" && result.APIs[i].Symbol == receiver { result.APIs[i].Methods = append(result.APIs[i].Methods, Item{Name: d.Name.Name, Type: signature, Summary: comment(d.Doc)}) } } } } } }
  data, err := json.MarshalIndent(result, "", "  "); if err != nil { panic(err) }; if err = os.WriteFile(*out, data, 0644); err != nil { panic(err) }
}
