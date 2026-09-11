//go:build js && wasm

package main

import (
	"encoding/json"
	"github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/localgame"
	"syscall/js"
)

func main() {
	catalog := content.MustLoadV4()
	callback := js.FuncOf(func(this js.Value, args []js.Value) (result any) {
		defer func() {
			if recover() != nil {
				result = `{"error":"local_save_invalid"}`
			}
		}()
		var request localgame.Request
		if len(args) != 1 || json.Unmarshal([]byte(args[0].String()), &request) != nil {
			return `{"error":"invalid_command"}`
		}
		data, err := json.Marshal(localgame.Handle(request, catalog))
		if err != nil {
			return `{"error":"local_save_invalid"}`
		}
		return string(data)
	})
	js.Global().Set("xuhuanCampaign", callback)
	select {}
}
