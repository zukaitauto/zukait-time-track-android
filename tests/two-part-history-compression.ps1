# Synthetic-only compression regression. No database, network or production access.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$source=Join-Path $PSScriptRoot '..\scripts\backup-zukait-two-part.ps1'
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Resolve-Path $source),[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Two-part backup script does not parse.'}
$definition=$ast.Find({
  param($node)
  $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
  $node.Name -eq 'CompressCsv'
},$true)
if($null -eq $definition){throw 'CompressCsv function not found.'}
. ([scriptblock]::Create($definition.Extent.Text))
$tmp=Join-Path ([IO.Path]::GetTempPath()) ('zukait-gzip-qa-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($tmp)|Out-Null
try {
 $original=Join-Path $tmp 'source.csv.partial'
 $gz=Join-Path $tmp 'source.csv.gz.partial'
 $bytes=[byte[]](0..255)
 [IO.File]::WriteAllBytes($original,$bytes)
 CompressCsv $original $gz
 if(-not (Test-Path -LiteralPath $gz)){throw 'Compressor did not create output.'}
 $stream=[IO.File]::OpenRead($gz)
 $zip=[IO.Compression.GZipStream]::new($stream,[IO.Compression.CompressionMode]::Decompress)
 $buffer=New-Object IO.MemoryStream
 try {$zip.CopyTo($buffer);$actual=$buffer.ToArray()}
 finally {$buffer.Dispose();$zip.Dispose();$stream.Dispose()}
 if(($actual -join ',') -ne ($bytes -join ',')){throw 'Compressed archive did not round-trip byte-for-byte.'}
 Write-Host 'PASS: actual history CompressCsv function round-trips binary-safe content without $input collision.'
} finally {
 Remove-Item -LiteralPath $tmp -Force -Recurse -ErrorAction SilentlyContinue
}
