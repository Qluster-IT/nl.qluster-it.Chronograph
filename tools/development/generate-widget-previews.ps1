$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$blue = [System.Drawing.ColorTranslator]::FromHtml('#2f8df6')
$red = [System.Drawing.ColorTranslator]::FromHtml('#f25f5c')

function RoundedPath([single]$x, [single]$y, [single]$width, [single]$height, [single]$radius) {
	$path = New-Object System.Drawing.Drawing2D.GraphicsPath
	$diameter = $radius * 2
	$path.AddArc($x, $y, $diameter, $diameter, 180, 90)
	$path.AddArc(($x + $width - $diameter), $y, $diameter, $diameter, 270, 90)
	$path.AddArc(($x + $width - $diameter), ($y + $height - $diameter), $diameter, $diameter, 0, 90)
	$path.AddArc($x, ($y + $height - $diameter), $diameter, $diameter, 90, 90)
	$path.CloseFigure()
	return $path
}

function FillRounded($graphics, $color, $x, $y, $width, $height, $radius) {
	$brush = New-Object System.Drawing.SolidBrush($color)
	$path = RoundedPath $x $y $width $height $radius
	try { $graphics.FillPath($brush, $path) }
	finally { $path.Dispose(); $brush.Dispose() }
}

function FillCircle($graphics, $color, $x, $y, $diameter) {
	$brush = New-Object System.Drawing.SolidBrush($color)
	try { $graphics.FillEllipse($brush, $x, $y, $diameter, $diameter) }
	finally { $brush.Dispose() }
}

function DrawStroke($graphics, $color, $width, $points) {
	$pen = New-Object System.Drawing.Pen($color, $width)
	$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
	$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
	$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
	try { $graphics.DrawLines($pen, [System.Drawing.PointF[]]$points) }
	finally { $pen.Dispose() }
}

foreach ($theme in @('light', 'dark')) {
	$card = [System.Drawing.ColorTranslator]::FromHtml($(if ($theme -eq 'light') { '#ffffff' } else { '#252832' }))
	$primary = [System.Drawing.ColorTranslator]::FromHtml($(if ($theme -eq 'light') { '#343943' } else { '#ecedf1' }))
	$muted = [System.Drawing.ColorTranslator]::FromHtml($(if ($theme -eq 'light') { '#aeb6c4' } else { '#767e90' }))
	$track = [System.Drawing.ColorTranslator]::FromHtml($(if ($theme -eq 'light') { '#e1e6ed' } else { '#444b5a' }))
	foreach ($type in @('timer', 'stopwatch', 'transition')) {
		$bitmap = New-Object System.Drawing.Bitmap(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
		$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
		try {
			$graphics.Clear([System.Drawing.Color]::Transparent)
			$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
			FillRounded $graphics ([System.Drawing.Color]::FromArgb(10, 0, 0, 0)) 92 218 840 604 55
			FillRounded $graphics ([System.Drawing.Color]::FromArgb(18, 0, 0, 0)) 96 211 832 604 52
			FillRounded $graphics $card 96 198 832 604 52

			FillCircle $graphics $blue 158 262 58
			if ($type -eq 'transition') {
				DrawStroke $graphics $card 6 @([System.Drawing.PointF]::new(171, 288), [System.Drawing.PointF]::new(190, 288), [System.Drawing.PointF]::new(202, 277))
				DrawStroke $graphics $card 6 @([System.Drawing.PointF]::new(171, 299), [System.Drawing.PointF]::new(190, 299), [System.Drawing.PointF]::new(202, 307))
			} else {
				$pen = New-Object System.Drawing.Pen($card, 5)
				try { $graphics.DrawEllipse($pen, 172, 276, 30, 30) } finally { $pen.Dispose() }
				DrawStroke $graphics $card 5 @([System.Drawing.PointF]::new(187, 281), [System.Drawing.PointF]::new(187, 291), [System.Drawing.PointF]::new(195, 296))
				if ($type -eq 'stopwatch') { FillRounded $graphics $card 182 269 10 5 2 }
			}
			FillRounded $graphics $primary 238 273 265 20 10
			FillRounded $graphics $muted 158 345 160 14 7
			FillRounded $graphics $blue 158 458 226 32 16
			FillRounded $graphics $blue 398 458 82 32 16

			FillCircle $graphics $blue 690 438 70
			FillRounded $graphics $card 712 458 7 30 3
			FillRounded $graphics $card 730 458 7 30 3
			FillCircle $graphics $red 784 438 70
			FillRounded $graphics $card 807 461 24 24 3

			if ($type -ne 'stopwatch') {
				FillRounded $graphics $track 158 602 696 14 7
				FillRounded $graphics $blue 158 602 420 14 7
				if ($type -eq 'transition') {
					foreach ($x in @(297, 436, 575, 714)) {
						FillRounded $graphics ([System.Drawing.Color]::FromArgb(150, $primary)) $x 602 3 14 1
					}
				}
			}
			$target = Join-Path $root "widgets\$type\preview-$theme.png"
			$bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
		} finally {
			$graphics.Dispose()
			$bitmap.Dispose()
		}
	}
}
