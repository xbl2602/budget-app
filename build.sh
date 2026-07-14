#!/bin/bash
# Build script for budget app - concatenates src/ files into single index.html
# Usage: bash build.sh
#
# Phase 1: Framework setup - markers produce empty tags if no files exist yet.
# As CSS/JS files are added in later phases, they will be automatically included.

SRC="src"
OUT="index.html"

# Step 1: Start from the source skeleton
cp "$SRC/index.html" "$OUT"

# Step 2: Replace markers using perl.
# We pass the directories as arguments and let perl handle file reading,
# which avoids shell escaping issues with CSS/JS content.
perl -i -0pe '
  BEGIN {
    our $src_dir = shift;
  }
  sub gather_files {
    my ($subdir, $ext) = @_;
    my $dir = "$src_dir/$subdir";
    my $content = "";
    opendir(my $dh, $dir) or return $content;
    my @files = sort grep { /\.$ext$/ && -f "$dir/$_" } readdir($dh);
    closedir($dh);
    foreach my $f (@files) {
      open(my $fh, "<", "$dir/$f") or next;
      local $/;
      my $file_content = <$fh>;
      close($fh);
      # Fixed (C6): wrap each JS file in try-catch so one syntax error does not break all scripts
      if ($ext eq "js") {
        $content .= "try{\n// === $f ===\n" . $file_content . "\n}catch(e){console.error(\x27[$f] failed:\x27, e)}\n";
      } else {
        $content .= $file_content;
      }
    }
    return $content;
  }

  my $css = gather_files("css", "css");
  my $js  = gather_files("js", "js");

  s/<!--build:css-->/<style>\n$css\n<\/style>/s;
  s/<!--build:js-->/<script>\n$js\n<\/script>/s;
' -- "$SRC" "$OUT"
